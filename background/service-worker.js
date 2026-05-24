// service-worker.js — Orchestrator: routes write operations to offscreen
// document so that FileSystemDirectoryHandle permissions survive service
// worker restarts. Downloads and zip fallback remain here.

importScripts('../shared/browser.js');
importScripts('../shared/i18n.js');
importScripts('../lib/jszip.min.js');

// ── Offscreen Document Management ──────────────────────────────────────

const OFFSCREEN_URL = 'offscreen/offscreen.html';
const DB_NAME = 'wechat-md-saver';
const DB_VERSION = 1;
const STORE_NAME = 'handles';

let _offscreenReady = false;
let _creatingOffscreen = null;

// In-memory handle cache for Firefox fallback
let _dirHandle = null;

// ── IndexedDB (for Firefox direct-write fallback) ─────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE_NAME); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadDirectoryHandle() {
  if (_dirHandle) return _dirHandle;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const db = await openDB();
      const handle = await new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get('dirHandle');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
      if (handle) {
        _dirHandle = handle;
        return handle;
      }
    } catch (e) {}
    if (attempt < 2) await new Promise(r => setTimeout(r, 200));
  }
  return null;
}

async function verifyHandleUsable(dirHandle) {
  try {
    const testName = '.wms_test_' + Date.now().toString(36);
    const testFile = await dirHandle.getFileHandle(testName, { create: true });
    const writable = await testFile.createWritable();
    await writable.write(new Uint8Array([1]));
    await writable.close();
    await dirHandle.removeEntry(testName);
    return true;
  } catch (e) {
    return false;
  }
}

async function attemptWrite(dirHandle, safeDirName, safeTitle, mdContent, succeeded, outputStructure) {
  try {
    const articleDir = await dirHandle.getDirectoryHandle(safeDirName, { create: true });
    let imagesDir;
    if (outputStructure === 'obsidian') {
      const assetsDir = await articleDir.getDirectoryHandle('assets', { create: true });
      imagesDir = await assetsDir.getDirectoryHandle(safeTitle, { create: true });
    } else {
      imagesDir = await articleDir.getDirectoryHandle('images', { create: true });
    }
    const mdFileName = outputStructure === 'obsidian' ? safeTitle + '.md' : 'article.md';
    const mdFile = await articleDir.getFileHandle(mdFileName, { create: true });
    const mdWritable = await mdFile.createWritable();
    await mdWritable.write(mdContent);
    await mdWritable.close();
    for (const r of succeeded) {
      const imgFile = await imagesDir.getFileHandle(r.filename, { create: true });
      const imgWritable = await imgFile.createWritable();
      await imgWritable.write(r.data);
      await imgWritable.close();
    }
    return { success: true, error: null };
  } catch (e) {
    return { success: false, error: e };
  }
}

async function ensureOffscreenDocument() {
  // Firefox and other non-Chromium browsers don't support the offscreen API.
  // In those browsers, the service worker writes files directly (which works
  // because their background scripts have different lifecycle behavior).
  if (!chrome.offscreen) return false;

  if (_offscreenReady) return true;

  // Check if already exists
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  const existing = clients.find(c => c.url.includes(OFFSCREEN_URL));
  if (existing) {
    _offscreenReady = true;
    return true;
  }

  // Prevent concurrent creation
  if (_creatingOffscreen) return _creatingOffscreen;

  _creatingOffscreen = (async () => {
    try {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: ['BLOBS'],
        justification: 'Persist FileSystemDirectoryHandle for folder writes'
      });
      // Wait for OFFSCREEN_READY message
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Offscreen document creation timed out'));
        }, 10000);
        const listener = (msg) => {
          if (msg.action === 'OFFSCREEN_READY') {
            clearTimeout(timeout);
            chrome.runtime.onMessage.removeListener(listener);
            resolve();
          }
        };
        chrome.runtime.onMessage.addListener(listener);
      });
      _offscreenReady = true;
      _creatingOffscreen = null;
      return true;
    } catch (e) {
      _creatingOffscreen = null;
      console.error('Failed to create offscreen document:', e);
      return false;
    }
  })();

  return _creatingOffscreen;
}

// Listen for heartbeat and ready messages from offscreen
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'OFFSCREEN_READY') {
    _offscreenReady = true;
  }
  if (msg.action === 'OFFSCREEN_HEARTBEAT') {
    _offscreenReady = true;
  }
});

// ── Keyboard Shortcuts ─────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return notifyBadge('?');
    if (!tab.url || !tab.url.includes('mp.weixin.qq.com/s/')) {
      return notifyBadge('✗');
    }

    if (command === 'save-to-folder') {
      await handleSaveToFolder(tab.id, null);
    } else if (command === 'copy-to-clipboard') {
      await handleCopyToClipboard(tab.id);
    } else if (command === 'save-as-pdf') {
      await generateAndSavePdf(tab.id, null);
    }
  } catch (err) {
    console.error('Command error:', err);
    notifyBadge('!');
  }
});

// ── Popup Connection ───────────────────────────────────────────────────

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'save-article') return;

  port.onMessage.addListener(async (msg) => {
    if (msg.action === 'SAVE_ARTICLE') {
      try {
        const tabId = await resolveTabId(msg);
        if (!tabId) {
          port.postMessage({ error: 'No active tab found.' });
          return;
        }
        await handleSaveToFolder(tabId, port);
      } catch (err) {
        port.postMessage({ error: err.message || 'Unknown error' });
      }
    } else if (msg.action === 'SAVE_PDF') {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) {
          port.postMessage({ error: 'No active tab found.' });
          return;
        }
        if (!tab.url || !tab.url.includes('mp.weixin.qq.com/s/')) {
          port.postMessage({ error: t('swNotArticle') });
          return;
        }
        await generateAndSavePdf(tab.id, port);
      } catch (err) {
        port.postMessage({ error: err.message || 'Unknown error' });
      }
    }
  });
});

async function resolveTabId(msg) {
  if (msg.tabId) {
    const tab = await chrome.tabs.get(msg.tabId);
    if (!tab) return null;
    if (!tab.url || !tab.url.includes('mp.weixin.qq.com/s/')) return null;
    return tab.id;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return null;
  if (!tab.url || !tab.url.includes('mp.weixin.qq.com/s/')) return null;
  return tab.id;
}

// ── Core: Save to Folder ───────────────────────────────────────────────

async function handleSaveToFolder(tabId, popupPort) {
  // 1. Extract article from content script
  sendStatus(popupPort, t('swExtracting'));
  const article = await extractArticle(tabId);
  if (!article) return;

  const { title, author, publishDate, markdown, images, sourceUrl } = article;

  // 2. Prepare payload for offscreen document
  const outputStructure = await getOutputStructure();
  const safeTitle = sanitizeFilename(title) || 'wechat-article';
  const safeDirName = safeTitle + '_' + Date.now().toString(36);

  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const frontmatter = [
    '---',
    'title: "' + escapeYaml(title) + '"',
    'author: "' + escapeYaml(author) + '"',
    'date: "' + escapeYaml(publishDate) + '"',
    'source: ' + sourceUrl,
    'saved_at: ' + now,
    '---', '', ''
  ].join('\n');

  const mdContent = frontmatter + markdown;

  const payload = {
    safeDirName,
    safeTitle,
    markdown: mdContent,
    images,
    outputStructure
  };

  // 3. Try writing via offscreen document (Chrome/Edge) or direct write (Firefox)
  let result = null;

  const offscreenReady = await ensureOffscreenDocument();
  if (offscreenReady) {
    // Chromium: route through offscreen document
    const progressListener = (msg) => {
      if (msg.action === 'WRITE_PROGRESS' && msg.payload) {
        const { key, args } = msg.payload;
        sendStatus(popupPort, t(key, args));
      }
    };
    chrome.runtime.onMessage.addListener(progressListener);

    try {
      result = await chrome.runtime.sendMessage({
        action: 'WRITE_ARTICLE',
        payload: payload
      });
    } catch (e) {
      // Offscreen document may have been garbage-collected — reset and recreate
      console.warn('Offscreen communication failed, recreating:', e.message);
      _offscreenReady = false;
      const recreated = await ensureOffscreenDocument();
      if (recreated) {
        try {
          result = await chrome.runtime.sendMessage({
            action: 'WRITE_ARTICLE',
            payload: payload
          });
        } catch (e2) {
          result = { success: false, code: 'COMMUNICATION_ERROR', message: e2.message };
        }
      } else {
        result = { success: false, code: 'COMMUNICATION_ERROR', message: e.message };
      }
    }

    chrome.runtime.onMessage.removeListener(progressListener);

    if (result && result.success) {
      sendDone(popupPort, safeDirName, result.imageCount || 0, result.imageErrors || 0);
      notifyBadge('');
      return;
    }

    console.warn('Offscreen write failed:', result?.code, result?.message);
  } else {
    // Non-Chromium: try direct write from service worker
    // (Firefox background scripts are persistent, so folder handles survive)
    const dirHandle = await loadDirectoryHandle();
    if (dirHandle) {
      const usable = await verifyHandleUsable(dirHandle);
      if (usable) {
        sendStatus(popupPort, t('swDownloading', [String(images.length)]));
        const imageResults = await downloadAllImages(images, (done, total) => {
          sendStatus(popupPort, t('swDownloadingProgress', [String(done), String(total)]));
        });
        const succeeded = imageResults.filter(r => r.data !== null);
        const imageLookup = {};
        succeeded.forEach(r => { imageLookup[r.originalUrl] = r.filename; });

        let imagePrefix;
        if (outputStructure === 'obsidian') {
          imagePrefix = 'assets/' + safeTitle + '/';
        } else {
          imagePrefix = 'images/';
        }
        let finalMarkdown = markdown;
        images.forEach(img => {
          if (imageLookup[img.url]) {
            finalMarkdown = finalMarkdown.replaceAll(img.url, imagePrefix + imageLookup[img.url]);
          }
        });

        const finalMd = frontmatter + finalMarkdown;
        sendStatus(popupPort, t('swWriting'));

        try {
          const writeResult = await attemptWrite(
            dirHandle, safeDirName, safeTitle, finalMd, succeeded, outputStructure
          );
          if (writeResult.success) {
            _dirHandle = dirHandle;
            sendDone(popupPort, safeDirName, succeeded.length, imageResults.length - succeeded.length);
            notifyBadge('');
            return;
          }
          console.warn('Direct write failed:', writeResult.error);
        } catch (e) {
          console.warn('Direct write exception:', e);
        }
      }
      _dirHandle = null;
    }
    result = { success: false, code: 'NO_FOLDER' };
  }

  // 4. Both offscreen and direct write failed — fall back to zip
  // Don't clear folderName/folderSet for PERMISSION_DENIED — the handle
  // might just need a user gesture to re-authorize in the options page.
  if (result?.code !== 'PERMISSION_DENIED') {
    chrome.storage.local.remove(['folderName', 'folderSet']);
  }

  sendStatus(popupPort, t('swDirectSaveFailed'));
  return handleZipFallback(tabId, popupPort, {
    title, author, publishDate, markdown, images, sourceUrl,
    outputStructure, safeTitle
  });
}

// ── Core: PDF ──────────────────────────────────────────────────────────

async function generateAndSavePdf(tabId, popupPort) {
  sendStatus(popupPort, t('swExtracting'));
  const article = await extractArticle(tabId);
  if (!article) return;

  const { title, author, publishDate, contentHtml, sourceUrl } = article;
  const printHtml = buildPrintHtml(title, author, publishDate, contentHtml, sourceUrl);

  sendStatus(popupPort, 'Generating PDF...');

  const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(printHtml);
  let pdfTab;
  try {
    pdfTab = await chrome.tabs.create({ url: dataUrl, active: false });
  } catch (e) {
    return fallbackPrintDialog(tabId, title, contentHtml, popupPort);
  }

  try {
    await new Promise((resolve, reject) => {
      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === pdfTab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('Tab load timeout'));
      }, 15000);
    });

    await new Promise(r => setTimeout(r, 1500));

    const B = __WMS_BROWSER__;
    await B.debugger.attach(pdfTab.id);
    const pdfResult = await B.debugger.sendCommand(
      pdfTab.id,
      'Page.printToPDF',
      {
        printBackground: true,
        paperWidth: 8.27,
        paperHeight: 11.69,
        marginTop: 0.4,
        marginBottom: 0.4,
        marginLeft: 0.4,
        marginRight: 0.4,
        preferCSSPageSize: false
      }
    );

    const pdfBase64 = pdfResult.data;
    const safeTitle = sanitizeFilename(title) || 'wechat-article';
    const pdfFilename = safeTitle + '.pdf';

    // Try writing via offscreen document
    const offscreenReady = await ensureOffscreenDocument();
    let savedToDir = false;

    if (offscreenReady) {
      try {
        const writeResult = await chrome.runtime.sendMessage({
          action: 'WRITE_PDF',
          payload: { filename: pdfFilename, data: pdfBase64 }
        });
        savedToDir = !!(writeResult && writeResult.success);
      } catch (e) {
        console.error('PDF offscreen write failed:', e);
      }
    }

    if (!savedToDir) {
      const pdfDataUrl = 'data:application/pdf;base64,' + pdfBase64;
      await chrome.downloads.download({ url: pdfDataUrl, filename: pdfFilename, saveAs: false });
    }

    sendDonePdf(popupPort, pdfFilename);
    notifyBadge('');
  } catch (err) {
    console.error('PDF debugger failed:', err);
    await fallbackPrintDialog(tabId, title, contentHtml, popupPort);
  } finally {
    try { await __WMS_BROWSER__.debugger.detach(pdfTab.id); } catch (e) {}
    try { await chrome.tabs.remove(pdfTab.id); } catch (e) {}
  }
}

async function fallbackPrintDialog(tabId, title, contentHtml, popupPort) {
  sendStatus(popupPort, t('popupPdfFailed'));
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'PRINT_PDF_FALLBACK', title: title, contentHtml: contentHtml });
  } catch (e) {
    sendStatus(popupPort, 'PDF generation failed');
  }
}

function buildPrintHtml(title, author, publishDate, contentHtml, sourceUrl) {
  const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<title>' + esc(title) + '</title>\n<style>\n'
    + '@page { margin: 15mm; size: A4; }\n'
    + '* { box-sizing: border-box; }\n'
    + 'body { max-width: 750px; margin: 0 auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 16px; line-height: 1.8; color: #333; background: #fff; }\n'
    + '.article-header { margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #07c160; }\n'
    + '.article-title { font-size: 24px; font-weight: 700; line-height: 1.4; color: #1a1a1a; margin-bottom: 12px; }\n'
    + '.article-meta { font-size: 14px; color: #888; }\n'
    + '.article-meta span { margin-right: 16px; }\n'
    + '.article-source { margin-top: 8px; font-size: 12px; color: #aaa; word-break: break-all; }\n'
    + '#js_content, .rich_media_content { font-size: 16px; line-height: 1.8; }\n'
    + '#js_content img, .rich_media_content img { max-width: 100%; height: auto; display: block; margin: 12px auto; }\n'
    + '#js_content p, .rich_media_content p { margin: 0 0 12px 0; }\n'
    + '#js_content h1, #js_content h2, #js_content h3, .rich_media_content h1, .rich_media_content h2, .rich_media_content h3 { margin: 20px 0 12px 0; font-weight: 600; }\n'
    + '#js_content blockquote, .rich_media_content blockquote { border-left: 3px solid #07c160; margin: 12px 0; padding: 4px 16px; color: #555; background: #f9fdf9; }\n'
    + '#js_content pre, .rich_media_content pre { background: #f5f5f5; border-radius: 6px; padding: 12px 16px; overflow-x: auto; font-size: 14px; line-height: 1.6; }\n'
    + '#js_content code, .rich_media_content code { background: #f0f0f0; border-radius: 3px; padding: 1px 5px; font-size: 0.9em; }\n'
    + '@media print { body { padding: 0; } .article-source { display: none; } }\n'
    + '</style>\n</head>\n<body>\n'
    + '<div class="article-header">\n<h1 class="article-title">' + esc(title) + '</h1>\n'
    + '<div class="article-meta">\n'
    + (author ? '<span>Author: ' + esc(author) + '</span>\n' : '')
    + (publishDate ? '<span>Date: ' + esc(publishDate) + '</span>\n' : '')
    + '</div>\n'
    + '<div class="article-source">Source: ' + esc(sourceUrl) + '</div>\n</div>\n'
    + contentHtml + '\n</body>\n</html>';
}

// ── Core: Copy to Clipboard ────────────────────────────────────────────

async function handleCopyToClipboard(tabId) {
  const article = await extractArticle(tabId);
  if (!article) return;

  const { title, author, publishDate, markdown, sourceUrl } = article;
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const frontmatter = [
    '---',
    'title: "' + escapeYaml(title) + '"',
    'author: "' + escapeYaml(author) + '"',
    'date: "' + escapeYaml(publishDate) + '"',
    'source: ' + sourceUrl,
    'saved_at: ' + now,
    '---', '', ''
  ].join('\n');

  await chrome.tabs.sendMessage(tabId, { action: 'COPY_TO_CLIPBOARD', text: frontmatter + markdown });
  notifyBadge('');
}

// ── Zip Fallback ───────────────────────────────────────────────────────

async function handleZipFallback(tabId, popupPort, cachedArticle) {
  const article = cachedArticle || await extractArticle(tabId);
  if (!article) return;

  const { title, author, publishDate, markdown, images, sourceUrl } = article;
  const imageResults = article.imageResults || null;
  const outputStructure = article.outputStructure || await getOutputStructure();
  const safeTitle = article.safeTitle || sanitizeFilename(title) || 'wechat-article';

  // Reuse pre-downloaded images if available, otherwise download now
  let succeeded;
  if (imageResults) {
    succeeded = imageResults.filter(r => r.data !== null);
  } else {
    sendStatus(popupPort, t('swDownloading', [String(images.length)]));
    const results = await downloadAllImages(images, () => {});
    succeeded = results.filter(r => r.data !== null);
  }

  const imageLookup = {};
  succeeded.forEach(r => { imageLookup[r.originalUrl] = r.filename; });

  let imagePrefix;
  if (outputStructure === 'obsidian') {
    imagePrefix = 'assets/' + safeTitle + '/';
  } else {
    imagePrefix = 'images/';
  }

  let finalMarkdown = markdown;
  images.forEach(img => {
    if (imageLookup[img.url]) {
      finalMarkdown = finalMarkdown.replaceAll(img.url, imagePrefix + imageLookup[img.url]);
    }
  });

  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const frontmatter = [
    '---',
    'title: "' + escapeYaml(title) + '"',
    'author: "' + escapeYaml(author) + '"',
    'date: "' + escapeYaml(publishDate) + '"',
    'source: ' + sourceUrl,
    'saved_at: ' + now,
    '---', '', ''
  ].join('\n');

  const mdContent = frontmatter + finalMarkdown;

  sendStatus(popupPort, t('swCreatingZip'));
  const zip = new JSZip();
  zip.file('article.md', mdContent);

  if (outputStructure === 'obsidian') {
    const assetsFolder = zip.folder('assets');
    const titleFolder = assetsFolder.folder(safeTitle);
    succeeded.forEach(r => { titleFolder.file(r.filename, r.data, { binary: true }); });
  } else {
    const imagesFolder = zip.folder('images');
    succeeded.forEach(r => { imagesFolder.file(r.filename, r.data, { binary: true }); });
  }

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const filename = safeTitle + '.zip';

  const buffer = await zipBlob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const dataUrl = 'data:application/zip;base64,' + btoa(binary);

  await chrome.downloads.download({ url: dataUrl, filename: filename, saveAs: false });
  sendDone(popupPort, filename, succeeded.length, (article.imageResults || []).length - succeeded.length || 0);
  notifyBadge('');
}

// ── Article Extraction ─────────────────────────────────────────────────

async function extractArticle(tabId) {
  const result = await chrome.tabs.sendMessage(tabId, { action: 'EXTRACT' });
  if (!result || !result.success) {
    console.error('Extraction failed:', result?.error);
    notifyBadge('!');
    return null;
  }
  return result.payload;
}

// ── Image Downloader (for zip fallback) ────────────────────────────────

async function downloadAllImages(images, onProgress) {
  const results = [];
  let completed = 0;

  const worker = async () => {
    while (completed < images.length) {
      const idx = completed++;
      const img = images[idx];
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const resp = await fetchWithTimeout(img.url, 15000);
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          const buffer = await resp.arrayBuffer();
          results[idx] = { filename: img.filename, data: new Uint8Array(buffer), originalUrl: img.url };
          break;
        } catch (e) {
          if (attempt === 1) {
            results[idx] = { filename: img.filename, data: null, originalUrl: img.url, error: e.message };
          }
        }
      }
      onProgress(results.filter(r => r !== undefined).length, images.length);
    }
  };

  const concurrency = Math.min(3, images.length || 1);
  const workers = [];
  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

// ── Storage Helpers ────────────────────────────────────────────────────

async function getOutputStructure() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['outputStructure'], (result) => {
      resolve(result.outputStructure || 'simple');
    });
  });
}

// ── Popup Status Helpers ───────────────────────────────────────────────

function sendStatus(port, msg) {
  if (!port) return;
  try { port.postMessage({ status: msg }); } catch (e) {}
}

function sendDone(port, filename, imageCount, imageErrors) {
  if (!port) return;
  try {
    port.postMessage({ done: true, filename: filename, imageCount: imageCount, imageErrors: imageErrors });
  } catch (e) {}
}

function sendDonePdf(port, pdfFilename) {
  if (!port) return;
  try {
    port.postMessage({ done: true, pdf: true, filename: pdfFilename });
  } catch (e) {}
}

// ── Badge Feedback ─────────────────────────────────────────────────────

function notifyBadge(text) {
  const B = __WMS_BROWSER__;
  if (text) {
    B.setBadgeText({ text: text });
    B.setBadgeBackgroundColor({ color: text === '✓' ? '#07c160' : '#ff4d4f' });
    setTimeout(() => B.setBadgeText({ text: '' }), 2000);
  } else {
    B.setBadgeText({ text: '✓' });
    B.setBadgeBackgroundColor({ color: '#07c160' });
    setTimeout(() => B.setBadgeText({ text: '' }), 1500);
  }
}

// ── Utilities ───────────────────────────────────────────────────────────

function sanitizeFilename(name) {
  return name
    .replace(/[\/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, '_')
    .substring(0, 100)
    .trim() || 'wechat-article';
}

function escapeYaml(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
