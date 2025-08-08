# Still Water CRm system (Offline-first PWA)

A tiny phone-friendly form that collects **Name**, **Barangay**, **Phone Number**, plus **geolocation**, works **offline**, and **syncs to Google Sheets** when online.

## What you get
- Installable PWA (add to home screen)
- Offline storage with IndexedDB
- Geolocation capture (lat/lng/accuracy)
- Sync queue that POSTs to a Google Apps Script backend (writes to a Sheet)

## Setup (10–15 min)
1. **Create a Google Sheet** in your Google Drive. Copy its ID from the URL (the long string between `/d/` and `/edit`).  
2. **Open Google Apps Script** (script.new), paste the contents of `const SHEET_ID = '1gI5oTpw9e0XHw5SqlaQEcyzW3EFR1fPGHOc673K2pZY';
const SHEET_NAME = 'Still Water CRM system Prototype V1';

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Timestamp (Server)', 'Timestamp (Client ISO)', 'Name', 'Barangay', 'Phone', 'Latitude', 'Longitude', 'Accuracy (m)', 'User Agent']);
    }

    sheet.appendRow([
      new Date(),
      body.timestamp || '',
      body.name || '',
      body.barangay || '',
      body.phone || '',
      body.lat || '',
      body.lng || '',
      body.accuracy || '',
      body.userAgent || ''
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON)
      .setHeaders({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' });
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON)
      .setHeaders({ 'Access-Control-Allow-Origin': '*' });
  }
}

function doGet() {
  return ContentService.createTextOutput('Still Water CRm system endpoint is up.');
}
`.  
3. Replace `1gI5oTpw9e0XHw5SqlaQEcyzW3EFR1fPGHOc673K2pZY` with your actual Sheet ID.  
4. **Deploy** → *New deployment* → *Web app*  
   - *Execute as:* Me  
   - *Who has access:* Anyone with the link  
   Copy the **Web app URL**.
5. **Host these files** (e.g., GitHub Pages, Netlify, Firebase Hosting, or any static host).  
6. On your phone, open the hosted **index.html**. Tap the footer to paste the **Web app URL** (it’s saved locally per device).  
7. **Add to Home Screen** to use as an app. Data you submit offline will sync automatically when online.

## Notes
- Location requires HTTPS and user interaction. Tap **Get Location** before submitting.
- You can change the Sheet tab name by editing `Still Water CRM system Prototype V1`.
- The app caches its shell for offline use; submissions are queued in IndexedDB.
- To clear the stored webhook URL on a device, clear the site’s local storage.

## Security
- The Web App URL is stored on-device only. For sensitive deployments, consider additional auth in Apps Script.
