// offscreen.js — Persistent page context for file system operations.
// Chrome MV3 service workers lose FileSystemDirectoryHandle permissions
// after restart. This offscreen document stays alive and holds the handle
// in a proper DOM context where permissions survive.

const DB_NAME = 'wechat-md-saver';
const DB_VERSION = 1;
const STORE_NAME = 'handles';

let _dirHandle = null;
let _keepAliveTimer = null;
let _db = null;

// ── IndexedDB ──────────────────────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE_NAME); };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

async function loadDirectoryHandle() {
  if (_dirHandle) return _dirHandle;
  try {
    const db = await openDB();
    const handle = await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get('dirHandle');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
    if (handle) {
      // Verify permission in this page context
      const perm = await verifyPermission(handle);
      if (perm === 'granted') {
        _dirHandle = handle;
        return handle;
      } else if (perm === 'prompt') {
        // Try to re-request — this works in a page context even without
        // a user gesture if the origin has a prior grant on file.
        try {
          const newPerm = await handle.requestPermission({ mode: 'readwrite' });
          if (newPerm === 'granted') {
            _dirHandle = handle;
            return handle;
          }
        } catch (e) { /* NotAllowedError — needs user gesture */ }
      }
      // Permission denied or prompt failed — handle is stale
      console.warn('Offscreen: stored handle has no write permission (state=' + perm + ')');
    }
  } catch (e) {
    console.error('Offscreen: failed to load handle from IndexedDB:', e);
  }
  return null;
}

async function verifyPermission(handle) {
  try {
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    return perm;
  } catch (e) {
    // queryPermission threw — likely not supported in this context
    // Fall back to a write test
    return await verifyHandleUsable(handle);
  }
}

async function verifyHandleUsable(dirHandle) {
  try {
    const testName = '.wms_test_' + Date.now().toString(36);
    const testFile = await dirHandle.getFileHandle(testName, { create: true });
    const writable = await testFile.createWritable();
    await writable.write(new Uint8Array([1]));
    await writable.close();
    await dirHandle.removeEntry(testName);
    return 'granted';
  } catch (e) {
    return 'denied';
  }
}

// Reload handle from IndexedDB (called when options page updates it)
async function reloadHandle() {
  _dirHandle = null;
  _db = null; // Force reconnect in case the connection is stale
  const handle = await loadDirectoryHandle();
  const stored = await chrome.storage.local.get(['folderName', 'folderSet']);
  if (handle && stored.folderSet) {
    return { usable: true, name: stored.folderName || handle.name };
  }
  return { usable: false, name: stored.folderName || null };
}

// ── Image Downloader ───────────────────────────────────────────────────

async function downloadAllImages(images, onProgress) {
  const results = [];
  let completed = 0;

  const worker = async () => {
    while (completed < images.length) {
      const idx = completed++;
      const img = images[idx];
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 15000);
          const resp = await fetch(img.url, { signal: controller.signal });
          clearTimeout(timer);
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          const buffer = await resp.arrayBuffer();
          results[idx] = {
            filename: img.filename,
            data: new Uint8Array(buffer),
            originalUrl: img.url
          };
          break;
        } catch (e) {
          if (attempt === 1) {
            results[idx] = {
              filename: img.filename,
              data: null,
              originalUrl: img.url,
              error: e.message
            };
          }
        }
      }
      if (onProgress) {
        onProgress(results.filter(r => r !== undefined).length, images.length);
      }
    }
  };

  const concurrency = Math.min(3, images.length || 1);
  const workers = [];
  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

// ── File Writing ───────────────────────────────────────────────────────

async function writeArticle(dirHandle, payload, sendProgress) {
  const { safeDirName, safeTitle, markdown, images, outputStructure } = payload;

  // Download images
  sendProgress('swDownloading', [String(images.length)]);
  const imageResults = await downloadAllImages(images, (done, total) => {
    sendProgress('swDownloadingProgress', [String(done), String(total)]);
  });
  const succeeded = imageResults.filter(r => r.data !== null);

  sendProgress('swWriting');

  const articleDir = await dirHandle.getDirectoryHandle(safeDirName, { create: true });

  let imagesDir;
  if (outputStructure === 'obsidian') {
    const assetsDir = await articleDir.getDirectoryHandle('assets', { create: true });
    imagesDir = await assetsDir.getDirectoryHandle(safeTitle, { create: true });
  } else {
    imagesDir = await articleDir.getDirectoryHandle('images', { create: true });
  }

  // Write markdown
  const mdFileName = outputStructure === 'obsidian' ? safeTitle + '.md' : 'article.md';
  const mdFile = await articleDir.getFileHandle(mdFileName, { create: true });
  const mdWritable = await mdFile.createWritable();
  await mdWritable.write(markdown);
  await mdWritable.close();

  // Write images
  for (const r of succeeded) {
    const imgFile = await imagesDir.getFileHandle(r.filename, { create: true });
    const imgWritable = await imgFile.createWritable();
    await imgWritable.write(r.data);
    await imgWritable.close();
  }

  return {
    success: true,
    imageCount: succeeded.length,
    imageErrors: imageResults.length - succeeded.length
  };
}

// ── Message Handler ────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.action) return false;

  if (msg.action === 'WRITE_ARTICLE') {
    handleWriteArticle(msg.payload, sender).then(sendResponse);
    return true; // async response
  }

  if (msg.action === 'RELOAD_HANDLE') {
    reloadHandle().then(sendResponse);
    return true;
  }

  if (msg.action === 'CHECK_HANDLE') {
    (async () => {
      const handle = await loadDirectoryHandle();
      if (!handle) {
        sendResponse({ usable: false, name: null, reason: 'not_found' });
        return;
      }
      const stored = await chrome.storage.local.get(['folderName']);
      sendResponse({ usable: true, name: stored.folderName || handle.name });
    })();
    return true;
  }

  if (msg.action === 'WRITE_PDF') {
    handleWritePdf(msg.payload).then(sendResponse);
    return true;
  }

  if (msg.action === 'PING') {
    sendResponse({ pong: true });
    return false;
  }
});

async function handleWriteArticle(payload, sender) {
  // Ensure we have a usable handle
  let dirHandle = await loadDirectoryHandle();

  if (!dirHandle) {
    chrome.storage.local.remove(['folderName', 'folderSet']);
    return { success: false, code: 'NO_FOLDER', message: 'No writable folder set' };
  }

  // Verify handle is usable
  const perm = await verifyPermission(dirHandle);
  if (perm !== 'granted') {
    // Try to re-request permission
    if (perm === 'prompt') {
      try {
        const newPerm = await dirHandle.requestPermission({ mode: 'readwrite' });
        if (newPerm !== 'granted') {
          chrome.storage.local.remove(['folderName', 'folderSet']);
          return { success: false, code: 'PERMISSION_DENIED', message: 'Folder permission denied' };
        }
        // Re-store the handle after permission refresh
        const db = await openDB();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).put(dirHandle, 'dirHandle');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch (e) {
        chrome.storage.local.remove(['folderName', 'folderSet']);
        return { success: false, code: 'PERMISSION_DENIED', message: 'Folder permission denied — please re-select folder in Settings' };
      }
    } else {
      chrome.storage.local.remove(['folderName', 'folderSet']);
      return { success: false, code: 'PERMISSION_DENIED', message: 'Folder access denied' };
    }
  }

  const sendProgress = (msgKey, args) => {
    chrome.runtime.sendMessage({
      action: 'WRITE_PROGRESS',
      payload: { key: msgKey, args: args || [] }
    }).catch(() => {});
  };

  try {
    const result = await writeArticle(dirHandle, payload, sendProgress);
    return { success: true, ...result };
  } catch (e) {
    console.error('Offscreen: write failed:', e);

    // Retry once after reloading handle
    _dirHandle = null;
    const reloaded = await loadDirectoryHandle();
    if (reloaded) {
      try {
        const retryPerm = await verifyPermission(reloaded);
        if (retryPerm === 'granted') {
          const result = await writeArticle(reloaded, payload, sendProgress);
          return { success: true, ...result };
        }
      } catch (e2) {
        console.error('Offscreen: retry also failed:', e2);
      }
    }

    chrome.storage.local.remove(['folderName', 'folderSet']);
    return { success: false, code: 'WRITE_FAILED', message: e.message || 'Failed to write files' };
  }
}

async function handleWritePdf(payload) {
  const { filename, data: pdfBase64 } = payload;
  const dirHandle = await loadDirectoryHandle();

  if (!dirHandle) {
    return { success: false, code: 'NO_FOLDER', message: 'No writable folder set' };
  }

  const perm = await verifyPermission(dirHandle);
  if (perm !== 'granted') {
    return { success: false, code: 'PERMISSION_DENIED' };
  }

  try {
    const binaryStr = atob(pdfBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    const pdfFile = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await pdfFile.createWritable();
    await writable.write(bytes);
    await writable.close();
    return { success: true };
  } catch (e) {
    console.error('Offscreen: PDF write failed:', e);
    return { success: false, code: 'WRITE_FAILED', message: e.message };
  }
}

// ── Keep-Alive ─────────────────────────────────────────────────────────
//
// Chrome may close offscreen documents after a period of inactivity.
// A periodic self-ping helps keep this document alive.

function startKeepAlive() {
  // Send a heartbeat every 4 minutes to prevent the offscreen document
  // from being garbage-collected by Chrome.
  _keepAliveTimer = setInterval(() => {
    chrome.runtime.sendMessage({ action: 'OFFSCREEN_HEARTBEAT' }).catch(() => {});
  }, 4 * 60 * 1000);
}

// ── Init ───────────────────────────────────────────────────────────────

(async () => {
  // Load handle on startup
  const handle = await loadDirectoryHandle();
  if (handle) {
    const stored = await chrome.storage.local.get(['folderName']);
    console.log('Offscreen: loaded handle for folder:', stored.folderName || handle.name);
  } else {
    console.log('Offscreen: no folder handle available');
  }
  startKeepAlive();
  // Tell the service worker we're ready
  chrome.runtime.sendMessage({ action: 'OFFSCREEN_READY' }).catch(() => {});
})();
