/* Minimal, dependency-free IndexedDB + sync client */
(function() {
  const DB_NAME = 'fielddata-db';
  const STORE = 'queue';
  const DB_VER = 1;

  const qs = (sel) => document.querySelector(sel);
  const statusBar = qs('#statusBar');
  const gpsBtn = qs('#gpsBtn');
  const gpsStat = qs('#gpsStat');
  const form = qs('#residentForm');
  const syncBtn = qs('#syncBtn');
  const queueCountEl = qs('#queueCount');
  const settingsDialog = qs('#settingsDialog');
  const endpointInput = qs('#endpointInput');
  const apiKeyInput = qs('#apiKeyInput');
  const openSettings = qs('#openSettings');
  const saveSettingsBtn = qs('#saveSettingsBtn');
  const clearQueueBtn = qs('#clearQueueBtn');

  let lastGPS = null;

  // --- Utilities ---
  const showStatus = (msg, kind = 'info', timeout = 3000) => {
    statusBar.textContent = msg;
    statusBar.className = `status ${kind}`;
    statusBar.hidden = false;
    if (timeout) setTimeout(() => (statusBar.hidden = true), timeout);
  };

  const getConfig = () => ({
    endpoint: localStorage.getItem('endpoint') || '',
    apiKey: localStorage.getItem('apiKey') || ''
  });

  const setConfigFromURL = () => {
    const u = new URL(location.href);
    const ep = u.searchParams.get('endpoint');
    const key = u.searchParams.get('key');
    if (ep) localStorage.setItem('endpoint', ep);
    if (key) localStorage.setItem('apiKey', key);
  };

  // --- IndexedDB wrapper ---
  let db;
  const openDB = () => new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        os.createIndex('by_synced', 'synced');
      }
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });

  const addToQueue = (record) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add({ ...record, synced: false, createdAt: Date.now() });
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });

  const getUnsent = () => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const idx = tx.objectStore(STORE).index('by_synced');
    const req = idx.getAll(false);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });

  const markSynced = (ids) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    ids.forEach(id => {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const rec = getReq.result; if (!rec) return;
        rec.synced = true; rec.syncedAt = Date.now();
        store.put(rec);
      };
    });
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });

  const clearQueue = () => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });

  const updateQueueCount = async () => {
    const unsent = await getUnsent();
    queueCountEl.textContent = `Queue: ${unsent.length}`;
  };

  // --- GPS capture ---
  const captureGPS = () => new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Geolocation not supported'));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        lastGPS = { latitude, longitude, accuracy, timestamp: Date.now() };
        gpsStat.textContent = `Lat ${latitude.toFixed(5)}, Lng ${longitude.toFixed(5)} (~${Math.round(accuracy)}m)`;
        resolve(lastGPS);
      },
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });

  // --- Sync logic ---
  const postJSON = async (url, data) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  const syncNow = async () => {
    const { endpoint, apiKey } = getConfig();
    if (!endpoint) { showStatus('Set endpoint in Settings first.', 'warn'); return; }

    const unsent = await getUnsent();
    if (!unsent.length) { showStatus('Nothing to sync.', 'info'); return; }

    showStatus(`Syncing ${unsent.length} record(s)…`, 'info', 0);

    try {
      // Send in small batches to handle flaky networks
      const batchSize = 20;
      for (let i = 0; i < unsent.length; i += batchSize) {
        const batch = unsent.slice(i, i + batchSize);
        const payload = { apiKey, records: batch.map(({ id, synced, ...r }) => r) };
        await postJSON(endpoint, payload);
        await markSynced(batch.map(r => r.id));
        await updateQueueCount();
      }
      showStatus('Sync complete ✔️', 'success');
    } catch (e) {
      console.error(e);
      showStatus(`Sync failed: ${e.message}`, 'error');
    }
  };

  // --- Event wiring ---
  window.addEventListener('online', () => { showStatus('Back online. Attempting sync…', 'info'); syncNow(); });
  if ('connection' in navigator && navigator.connection) {
    navigator.connection.addEventListener('change', () => {
      if (navigator.onLine) syncNow();
    });
  }

  gpsBtn.addEventListener('click', async () => {
    gpsBtn.disabled = true; gpsStat.textContent = 'Capturing…';
    try { await captureGPS(); showStatus('GPS captured.', 'success'); }
    catch (e) { showStatus(`GPS error: ${e.message}`, 'error'); gpsStat.textContent = 'Not captured'; }
    finally { gpsBtn.disabled = false; }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = qs('#name').value.trim();
    const barangay = qs('#barangay').value.trim();
    const phone = qs('#phone').value.trim();

    if (!name || !barangay) { showStatus('Please fill in Name and Barangay.', 'warn'); return; }

    const record = {
      name, barangay, phone,
      gps: lastGPS || null,
      createdAt: Date.now(),
      clientId: crypto.randomUUID()
    };

    await addToQueue(record);
    await updateQueueCount();
    form.reset();
    lastGPS = null; gpsStat.textContent = 'Not captured';

    showStatus('Saved locally. Will sync when online.', 'success');
    if (navigator.onLine) syncNow();
  });

  openSettings.addEventListener('click', () => {
    const { endpoint, apiKey } = getConfig();
    endpointInput.value = endpoint; apiKeyInput.value = apiKey;
    settingsDialog.showModal();
  });

  saveSettingsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.setItem('endpoint', endpointInput.value.trim());
    localStorage.setItem('apiKey', apiKeyInput.value.trim());
    settingsDialog.close();
    showStatus('Settings saved.', 'success');
  });

  clearQueueBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (confirm('Clear ALL local records? This cannot be undone.')) {
      await clearQueue();
      await updateQueueCount();
      showStatus('Local queue cleared.', 'success');
    }
  });

  // Init
  (async function init() {
    setConfigFromURL();
    await openDB();
    await updateQueueCount();
    if (navigator.onLine) syncNow();
  })();
})();