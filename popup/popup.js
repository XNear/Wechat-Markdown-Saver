// popup.js — Extension popup UI

const saveBtn = document.getElementById('save-btn');
const copyBtn = document.getElementById('copy-btn');
const pdfBtn = document.getElementById('pdf-btn');
const statusText = document.getElementById('status-text');
const spinner = document.getElementById('spinner');
const resultDiv = document.getElementById('result');
const settingsLink = document.getElementById('settings-link');
const urlInput = document.getElementById('url-input');
const urlSaveBtn = document.getElementById('url-save-btn');
const folderNameEl = document.getElementById('folder-name');
const changeFolderLink = document.getElementById('change-folder-link');

let port = null;

// Apply i18n and placeholders once ready
onI18nReady(() => {
  applyI18n();
  // Placeholder for URL input
  urlInput.placeholder = t('popupUrlPlaceholder');
});

function disableAll() {
  saveBtn.disabled = true;
  copyBtn.disabled = true;
  pdfBtn.disabled = true;
  urlSaveBtn.disabled = true;
}

function enableAll() {
  saveBtn.disabled = false;
  copyBtn.disabled = false;
  pdfBtn.disabled = false;
  urlSaveBtn.disabled = !urlInput.value.trim();
}

function setState(state, data) {
  statusText.className = 'status-text';
  spinner.classList.remove('active');
  resultDiv.className = 'result';
  enableAll();

  switch (state) {
    case 'idle':
      statusText.textContent = t('popupReady');
      statusText.classList.add('idle');
      break;
    case 'working':
      statusText.textContent = data || t('popupWorking');
      statusText.classList.add('working');
      spinner.classList.add('active');
      disableAll();
      break;
    case 'success':
      statusText.textContent = t('popupDone');
      statusText.classList.add('success');
      resultDiv.className = 'result visible success';
      resultDiv.innerHTML = '<span class="result-icon">&#10003;</span> ' + data;
      break;
    case 'error':
      statusText.textContent = t('popupFailed');
      statusText.classList.add('error');
      resultDiv.className = 'result visible error';
      resultDiv.innerHTML = '<span class="result-icon">&#10007;</span> ' + data;
      break;
    case 'not-article':
      statusText.textContent = t('popupNotArticle');
      statusText.classList.add('error');
      disableAll();
      resultDiv.className = 'result visible error';
      resultDiv.innerHTML = '<span class="result-icon">&#10007;</span> ' + t('popupNotArticleMsg');
      break;
  }
}

// --- Current page actions ---

function triggerAction(actionType) {
  if (actionType === 'COPY') {
    handleCopy();
    return;
  }
  if (actionType === 'PDF') {
    handlePdf();
    return;
  }
  // SAVE
  setState('working', t('popupSaveToFolder'));
  port = chrome.runtime.connect({ name: 'save-article' });
  port.onMessage.addListener((msg) => {
    if (msg.status) setState('working', msg.status);
    if (msg.done) {
      const details = msg.imageErrors
        ? t('popupSavedWithErrors', [msg.filename, String(msg.imageCount), String(msg.imageErrors)])
        : t('popupSaved', [msg.filename, String(msg.imageCount)]);
      setState('success', details);
      port.disconnect();
    }
    if (msg.error) { setState('error', msg.error); port.disconnect(); }
  });
  port.onDisconnect.addListener(() => {
    if (saveBtn.disabled && !resultDiv.className.includes('visible')) {
      setState('error', t('popupConnectionLost'));
    }
  });
  port.postMessage({ action: 'SAVE_ARTICLE' });
}

async function handleCopy() {
  setState('working', t('popupCopyingToClipboard'));
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes('mp.weixin.qq.com/s/')) {
      setState('not-article'); return;
    }
    const extractResult = await chrome.tabs.sendMessage(tab.id, { action: 'EXTRACT' });
    if (!extractResult || !extractResult.success) {
      setState('error', extractResult?.error || t('swExtractionFailed')); return;
    }
    const { title, author, publishDate, markdown, sourceUrl } = extractResult.payload;
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const esc = (s) => (s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const frontmatter = [
      '---', 'title: "' + esc(title) + '"', 'author: "' + esc(author) + '"',
      'date: "' + esc(publishDate) + '"', 'source: ' + sourceUrl, 'saved_at: ' + now,
      '---', '', ''
    ].join('\n');
    await chrome.tabs.sendMessage(tab.id, { action: 'COPY_TO_CLIPBOARD', text: frontmatter + markdown });
    setState('success', t('popupCopied'));
  } catch (err) {
    setState('error', err.message || t('popupCopyFailed'));
  }
}

function handlePdf() {
  setState('working', t('popupSavingPdf'));
  port = chrome.runtime.connect({ name: 'save-article' });
  port.onMessage.addListener((msg) => {
    if (msg.status) setState('working', msg.status);
    if (msg.done) {
      if (msg.pdf) {
        setState('success', t('popupPdfSaved', [msg.filename]));
      }
      port.disconnect();
    }
    if (msg.error) { setState('error', msg.error); port.disconnect(); }
  });
  port.onDisconnect.addListener(() => {
    if (pdfBtn.disabled && !resultDiv.className.includes('visible')) {
      setState('error', t('popupConnectionLost'));
    }
  });
  port.postMessage({ action: 'SAVE_PDF' });
}

saveBtn.addEventListener('click', () => triggerAction('SAVE'));
copyBtn.addEventListener('click', () => triggerAction('COPY'));
pdfBtn.addEventListener('click', () => triggerAction('PDF'));

// --- URL input ---

urlInput.addEventListener('input', () => {
  const val = urlInput.value.trim();
  urlSaveBtn.disabled = !val || !val.includes('mp.weixin.qq.com/s/');
});

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !urlSaveBtn.disabled) urlSaveBtn.click();
});

urlSaveBtn.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  if (!url || !url.includes('mp.weixin.qq.com/s/')) return;
  setState('working', t('swOpeningArticle'));
  urlSaveBtn.disabled = true;

  try {
    const tab = await chrome.tabs.create({ url: url, active: false });
    await new Promise((resolve, reject) => {
      const listener = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); reject(new Error(t('swPageLoadTimeout'))); }, 30000);
    });
    await new Promise(r => setTimeout(r, 2000));

    const extractResult = await chrome.tabs.sendMessage(tab.id, { action: 'EXTRACT' });
    if (!extractResult || !extractResult.success) {
      await chrome.tabs.remove(tab.id);
      setState('error', extractResult?.error || 'Extraction failed'); return;
    }

    port = chrome.runtime.connect({ name: 'save-article' });
    port.onMessage.addListener(async (msg) => {
      if (msg.status) setState('working', msg.status);
      if (msg.done) {
        const details = msg.imageErrors
          ? t('popupSavedWithErrors', [msg.filename, String(msg.imageCount), String(msg.imageErrors)])
          : t('popupSaved', [msg.filename, String(msg.imageCount)]);
        setState('success', details);
        port.disconnect();
        try { await chrome.tabs.remove(tab.id); } catch (e) {}
        urlInput.value = ''; urlSaveBtn.disabled = true;
      }
      if (msg.error) { setState('error', msg.error); port.disconnect(); try { await chrome.tabs.remove(tab.id); } catch (e) {} }
    });
    port.onDisconnect.addListener(async () => {
      if (urlSaveBtn.disabled && !resultDiv.className.includes('visible')) {
        setState('error', t('popupConnectionLost'));
        try { await chrome.tabs.remove(tab.id); } catch (e) {}
      }
    });
    port.postMessage({ action: 'SAVE_ARTICLE', tabId: tab.id });
  } catch (err) {
    setState('error', err.message || 'Failed to save URL');
  }
});

// --- Links ---

changeFolderLink.addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
settingsLink.addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });

// --- Init ---

onI18nReady(async () => {
  const stored = await chrome.storage.local.get(['folderName', 'folderSet']);
  if (stored.folderSet && stored.folderName) {
    folderNameEl.textContent = stored.folderName;
    folderNameEl.classList.add('set');
  } else {
    folderNameEl.textContent = t('popupFolderNoSet');
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes('mp.weixin.qq.com/s/')) {
      setState('not-article');
    }
  } catch (e) {}
});
