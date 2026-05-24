// options.js — Settings page: folder, mode, structure, language

const DB_NAME = 'wechat-md-saver';
const DB_VERSION = 1;
const STORE_NAME = 'handles';

let db = null;

onI18nReady(() => { applyI18n(); });

// --- IndexedDB ---

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE_NAME); };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

async function storeDirectoryHandle(handle) {
  await chrome.storage.local.set({ folderName: handle.name, folderSet: true });
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, 'dirHandle');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadDirectoryHandle() {
  const database = await openDB();
  return new Promise((resolve) => {
    const tx = database.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get('dirHandle');
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

async function clearDirectoryHandle() {
  await chrome.storage.local.remove(['folderName', 'folderSet']);
  const database = await openDB();
  return new Promise((resolve) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete('dirHandle');
    tx.oncomplete = () => resolve();
  });
}

// --- UI ---

const folderPathEl = document.getElementById('folder-path');
const folderHintEl = document.getElementById('folder-hint');
const pickBtn = document.getElementById('pick-folder-btn');
const clearBtn = document.getElementById('clear-folder-btn');
const toastEl = document.getElementById('toast');

function showToast(msg, success) {
  toastEl.textContent = msg;
  toastEl.className = 'toast' + (success ? ' success' : '');
  setTimeout(() => { toastEl.className = 'toast hidden'; }, 2500);
}

async function renderFolderStatus() {
  const stored = await chrome.storage.local.get(['folderName', 'folderSet']);
  if (stored.folderSet && stored.folderName) {
    const handle = await loadDirectoryHandle();
    if (handle) {
      folderPathEl.textContent = stored.folderName;
      folderPathEl.classList.add('selected');
      folderHintEl.textContent = t('optionsFolderReady');
    } else {
      folderPathEl.textContent = stored.folderName + ' (expired)';
      folderPathEl.classList.add('selected');
      folderHintEl.textContent = t('optionsFolderExpired');
    }
  } else {
    folderPathEl.textContent = t('optionsFolderNotSelected');
    folderPathEl.classList.remove('selected');
    folderHintEl.textContent = t('optionsFolderHint');
  }
}

// --- Check File System Access API availability ---
const hasFileSystemAccess = typeof window.showDirectoryPicker === 'function';

if (!hasFileSystemAccess) {
  pickBtn.disabled = true;
  pickBtn.title = t('optionsFolderNotSupported');
  folderHintEl.textContent = t('optionsFolderNotSupportedHint');
}

// Init
onI18nReady(async () => {
  chrome.storage.local.get(['saveMode', 'outputStructure', 'uiLanguage'], (result) => {
    if (result.saveMode) {
      const r = document.querySelector(`input[name="saveMode"][value="${result.saveMode}"]`);
      if (r) r.checked = true;
    }
    if (result.outputStructure) {
      const r = document.querySelector(`input[name="outputStructure"][value="${result.outputStructure}"]`);
      if (r) r.checked = true;
    }
    if (result.uiLanguage) {
      const r = document.querySelector(`input[name="uiLanguage"][value="${result.uiLanguage}"]`);
      if (r) r.checked = true;
    } else {
      const curLang = getCurrentLang();
      const r = document.querySelector(`input[name="uiLanguage"][value="${curLang}"]`);
      if (r) r.checked = true;
    }
  });
  await renderFolderStatus();
});

// Language switch — real-time
document.querySelectorAll('input[name="uiLanguage"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const lang = radio.value;
    switchLang(lang);
    chrome.storage.local.set({ uiLanguage: lang }, () => {
      applyI18n();
      renderFolderStatus();
      showToast(t('optionsLanguageSaved'), true);
    });
  });
});

// Pick folder
pickBtn.addEventListener('click', async () => {
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await storeDirectoryHandle(handle);
    folderPathEl.textContent = handle.name;
    folderPathEl.classList.add('selected');
    folderHintEl.textContent = t('optionsFolderReady');
    showToast(t('optionsFolderSelected', [handle.name]), true);
  } catch (err) {
    if (err.name !== 'AbortError') {
      showToast(t('optionsAccessError') + ': ' + err.message, false);
    }
  }
});

// Clear folder
clearBtn.addEventListener('click', async () => {
  await clearDirectoryHandle();
  folderPathEl.textContent = t('optionsFolderNotSelected');
  folderPathEl.classList.remove('selected');
  folderHintEl.textContent = t('optionsFolderHint');
  showToast(t('optionsFolderCleared'));
});

// Output structure
document.querySelectorAll('input[name="outputStructure"]').forEach(radio => {
  radio.addEventListener('change', () => {
    chrome.storage.local.set({ outputStructure: radio.value });
    showToast(t('optionsOutputSaved'), true);
  });
});

// Save mode
document.querySelectorAll('input[name="saveMode"]').forEach(radio => {
  radio.addEventListener('change', () => {
    chrome.storage.local.set({ saveMode: radio.value });
    showToast(t('optionsModeSaved'), true);
  });
});
