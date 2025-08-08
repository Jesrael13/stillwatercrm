// Minimal IndexedDB helper
const DB_NAME = 'still-water-db';
const STORE = 'queue';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, {keyPath: 'id', autoIncrement: true});
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addToQueue(payload) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add({payload, createdAt: Date.now()});
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllQueued() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function removeFromQueue(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// Replace with your deployed Apps Script web app URL
const WEB_APP_URL = localStorage.getItem('SW_WEBAPP_URL') || '';

async function trySync() {
  if (!navigator.onLine || !WEB_APP_URL) return;
  const queued = await getAllQueued();
  for (const item of queued) {
    try {
      const res = await fetch(WEB_APP_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(item.payload),
      });
      if (res.ok) {
        await removeFromQueue(item.id);
        console.log('Synced item', item.id);
      } else {
        console.warn('Sync failed for', item.id, await res.text());
      }
    } catch (err) {
      console.warn('Network error during sync', err);
      break; // stop and retry later
    }
  }
}

window.addEventListener('online', trySync);

// Geolocation handling
const locBtn = document.getElementById('locBtn');
const geoStatus = document.getElementById('geoStatus');
const latEl = document.getElementById('lat');
const lngEl = document.getElementById('lng');
const accEl = document.getElementById('accuracy');
const note = document.getElementById('note');

locBtn.addEventListener('click', () => {
  if (!('geolocation' in navigator)) {
    geoStatus.textContent = 'Geolocation not supported on this device.';
    return;
  }
  geoStatus.textContent = 'Getting location…';
  locBtn.disabled = true;
  navigator.geolocation.getCurrentPosition((pos) => {
    const { latitude, longitude, accuracy } = pos.coords;
    latEl.value = latitude;
    lngEl.value = longitude;
    accEl.value = accuracy;
    geoStatus.textContent = `Lat: ${latitude.toFixed(6)}, Lng: ${longitude.toFixed(6)} (±${Math.round(accuracy)}m)`;
    locBtn.disabled = false;
  }, (err) => {
    geoStatus.textContent = 'Failed to get location: ' + err.message;
    locBtn.disabled = false;
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
});

// Form submission
const form = document.getElementById('crmForm');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  note.textContent = 'Saving…';
  const payload = {
    timestamp: new Date().toISOString(),
    name: document.getElementById('name').value.trim(),
    barangay: document.getElementById('barangay').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    lat: latEl.value || null,
    lng: lngEl.value || null,
    accuracy: accEl.value || null,
    userAgent: navigator.userAgent
  };

  try {
    await addToQueue(payload);
    note.textContent = navigator.onLine && WEB_APP_URL ? 'Saved locally. Will sync shortly…' : 'Saved offline. Will sync when online.';
    form.reset();
    geoStatus.textContent = 'Location not captured yet.';
  } catch (err) {
    note.textContent = 'Error saving locally: ' + err.message;
  }

  // Attempt immediate sync if online
  trySync();
});

// Attempt to sync on load
trySync();

// Simple admin setter for WEB_APP_URL (long-press footer)
document.querySelector('footer').addEventListener('click', () => {
  const curr = localStorage.getItem('SW_WEBAPP_URL') || '';
  const url = prompt('Enter Google Apps Script Web App URL (kept on this device):', curr);
  if (url !== null) {
    localStorage.setItem('SW_WEBAPP_URL', url.trim());
    alert('Saved.');
    trySync();
  }
});
