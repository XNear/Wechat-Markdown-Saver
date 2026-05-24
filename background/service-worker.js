// service-worker.js — Orchestrator: keyboard shortcuts, directory writing, image downloads

importScripts('../shared/browser.js');
importScripts('../shared/i18n.js');
importScripts('../lib/jszip.min.js');

const DB_NAME = 'wechat-md-saver';
const DB_VERSION = 1;
const STORE_NAME = 'handles';

// In-memory handle cache — populated on first successful load from IndexedDB.
let _dirHandle = null;

// --- IndexedDB ---

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

  // Read from IndexedDB (same origin as options page — should be shared).
  // Retry a few times in case the page's transaction hasn't committed yet.
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
    } catch (e) {
      // ignore and retry
    }
    if (attempt < 2) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  return null;
}

async function getOutputStructure() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['outputStructure'], (result) => {
      resolve(result.outputStructure || 'simple');
    });
  });
}

// --- Keyboard Shortcuts ---

chrome.commands.onCommand.addListener(async (command) => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return notifyBadge('?');
    if (!tab.url || !tab.url.includes('mp.weixin.qq.com/s/')) {
      return notifyBadge('✗');
    }

    if (command === 'save-to-folder') {
      await handleSaveToFolder(tab.id);
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

// --- Popup Connection ---

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'save-article') return;

  port.onMessage.addListener(async (msg) => {
    if (msg.action === 'SAVE_ARTICLE') {
      try {
        const specifiedTabId = msg.tabId;
        let tabId, tabUrl;

        if (specifiedTabId) {
          const tab = await chrome.tabs.get(specifiedTabId);
          tabId = tab.id;
          tabUrl = tab.url;
        } else {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab || !tab.id) {
            port.postMessage({ error: 'No active tab found.' });
            return;
          }
          tabId = tab.id;
          tabUrl = tab.url;
        }

        if (!tabUrl || !tabUrl.includes('mp.weixin.qq.com/s/')) {
          port.postMessage({ error: t('swNotArticle') });
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

// --- Core: Save to Folder ---

async function handleSaveToFolder(tabId, popupPort) {
  let dirHandle = await loadDirectoryHandle();

  // --- Verify the handle is actually usable with a quick test write ---
  if (dirHandle) {
    const usable = await verifyHandleUsable(dirHandle);
    if (!usable) {
      // Handle is stale — clear cache and try to reload once
      console.warn('Cached directory handle is stale, attempting reload...');
      _dirHandle = null;
      dirHandle = await loadDirectoryHandle();
      if (dirHandle) {
        const retryUsable = await verifyHandleUsable(dirHandle);
        if (!retryUsable) {
          // Still stale after reload — inform user and fall back
          console.warn('Directory handle still stale after reload');
          _dirHandle = null;
          dirHandle = null;
        }
      }
    }
  }

  if (!dirHandle) {
    sendStatus(popupPort, t('swNoFolderSet'));
    return handleZipFallback(tabId, popupPort);
  }

  sendStatus(popupPort, t('swExtracting'));
  const article = await extractArticle(tabId);
  if (!article) return;

  const { title, author, publishDate, markdown, images, sourceUrl } = article;

  sendStatus(popupPort, t('swDownloading', [String(images.length)]));
  const imageResults = await downloadAllImages(images, (done, total) => {
    sendStatus(popupPort, t('swDownloadingProgress', [String(done), String(total)]));
  });

  const succeeded = imageResults.filter(r => r.data !== null);
  const imageLookup = {};
  succeeded.forEach(r => { imageLookup[r.originalUrl] = r.filename; });

  const outputStructure = await getOutputStructure();
  const safeTitle = sanitizeFilename(title) || 'wechat-article';
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

  sendStatus(popupPort, t('swWriting'));
  const safeDirName = safeTitle + '_' + Date.now().toString(36);

  // Attempt direct write. On failure, try clearing the handle cache and
  // reloading once before falling back to zip.
  const writeResult = await attemptWrite(
    dirHandle, safeDirName, safeTitle, mdContent, succeeded, outputStructure
  );

  if (writeResult.success) {
    sendDone(popupPort, safeDirName, succeeded.length, imageResults.length - succeeded.length);
    notifyBadge('');
    return;
  }

  // Write failed — try recovering the handle once
  console.warn('First write attempt failed:', writeResult.error);
  _dirHandle = null;
  const reloadedHandle = await loadDirectoryHandle();
  if (reloadedHandle) {
    const reloadUsable = await verifyHandleUsable(reloadedHandle);
    if (reloadUsable) {
      sendStatus(popupPort, t('swWriting'));
      const retryResult = await attemptWrite(
        reloadedHandle, safeDirName, safeTitle, mdContent, succeeded, outputStructure
      );
      if (retryResult.success) {
        _dirHandle = reloadedHandle;
        sendDone(popupPort, safeDirName, succeeded.length, imageResults.length - succeeded.length);
        notifyBadge('');
        return;
      }
      console.warn('Retry write also failed:', retryResult.error);
    }
  }

  // Both attempts failed — fall back to zip, reusing already-downloaded image data
  console.error('Direct write failed after retry, falling back to zip');
  sendStatus(popupPort, t('swDirectSaveFailed'));
  return handleZipFallback(tabId, popupPort, {
    title, author, publishDate, markdown, images, sourceUrl,
    imageResults, outputStructure, safeTitle
  });
}

// Test whether a directory handle can actually be written to.
// queryPermission alone is unreliable in service workers.
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
    console.warn('Handle verification failed:', e.message);
    return false;
  }
}

// Attempt to write article + images to the given directory handle.
// Returns { success, error } — never throws.
async function attemptWrite(dirHandle, safeDirName, safeTitle, mdContent, succeeded, outputStructure) {
  try {
    const articleDir = await dirHandle.getDirectoryHandle(safeDirName, { create: true });

    let imagesDir;
    if (outputStructure === 'obsidian') {
      const assetsDir = await articleDir.getDirectoryHandle('assets', { create: true });
      const titleDir = await assetsDir.getDirectoryHandle(safeTitle, { create: true });
      imagesDir = titleDir;
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

// --- Core: Copy to Clipboard ---

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

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.tabs.sendMessage(tab.id, { action: 'COPY_TO_CLIPBOARD', text: frontmatter + markdown });
  notifyBadge('');
}

// --- Core: Save as PDF ---

async function generateAndSavePdf(tabId, popupPort) {
  sendStatus(popupPort, t('swExtracting'));
  const article = await extractArticle(tabId);
  if (!article) return;

  const { title, author, publishDate, contentHtml, sourceUrl } = article;
  const printHtml = buildPrintHtml(title, author, publishDate, contentHtml, sourceUrl);

  sendStatus(popupPort, 'Generating PDF...');

  // Open a hidden tab with the print HTML
  const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(printHtml);
  let pdfTab;
  try {
    pdfTab = await chrome.tabs.create({ url: dataUrl, active: false });
  } catch (e) {
    return fallbackPrintDialog(tabId, title, contentHtml, popupPort);
  }

  try {
    // Wait for tab to load
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

    // Allow rendering to settle
    await new Promise(r => setTimeout(r, 1500));

    // Attach debugger and generate PDF
    const B = __WMS_BROWSER__;
    await B.debugger.attach(pdfTab.id);
    const result = await B.debugger.sendCommand(
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

    const pdfBase64 = result.data;
    const safeTitle = sanitizeFilename(title) || 'wechat-article';
    const pdfFilename = safeTitle + '.pdf';

    // Try to write to folder, fall back to download
    const dirHandle = await loadDirectoryHandle();
    let savedToDir = false;

    if (dirHandle) {
      let permDenied = false;
      try {
        const perm = await dirHandle.queryPermission({ mode: 'readwrite' });
        permDenied = (perm === 'denied');
      } catch (permErr) {
        // queryPermission threw — attempt write anyway
        console.warn('PDF: queryPermission error, attempting write:', permErr);
      }
      if (!permDenied) {
        try {
          const pdfFile = await dirHandle.getFileHandle(pdfFilename, { create: true });
          const writable = await pdfFile.createWritable();
          const binaryStr = atob(pdfBase64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
          await writable.write(bytes);
          await writable.close();
          savedToDir = true;
        } catch (e) {
          console.error('PDF folder write failed:', e);
        }
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

// --- Zip Fallback ---
//
// When `cachedArticle` carries `imageResults` (from a failed direct write),
// those results are reused so we don't re-download every image.

async function handleZipFallback(tabId, popupPort, cachedArticle) {
  const article = cachedArticle || await extractArticle(tabId);
  if (!article) return;

  const { title, author, publishDate, markdown, images, sourceUrl } = article;

  // Reuse pre-downloaded image data when available
  let imageResults = article.imageResults || null;
  let outputStructure = article.outputStructure || await getOutputStructure();
  let safeTitle = article.safeTitle || sanitizeFilename(title) || 'wechat-article';

  if (!imageResults) {
    sendStatus(popupPort, t('swDownloading', [String(images.length)]));
    imageResults = await downloadAllImages(images, () => {});
  }

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
  sendDone(popupPort, filename, succeeded.length, imageResults.length - succeeded.length);
  notifyBadge('');
}

// --- Article Extraction ---

async function extractArticle(tabId) {
  const result = await chrome.tabs.sendMessage(tabId, { action: 'EXTRACT' });
  if (!result || !result.success) {
    console.error('Extraction failed:', result?.error);
    notifyBadge('!');
    return null;
  }
  return result.payload;
}

// --- Image Downloader ---

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

  const concurrency = Math.min(3, images.length);
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

// --- Popup Status Helpers ---

function sendStatus(port, msg) {
  if (!port) return;
  try { port.postMessage({ status: msg }); } catch (e) { /* port disconnected */ }
}

function sendDone(port, filename, imageCount, imageErrors) {
  if (!port) return;
  try {
    port.postMessage({ done: true, filename: filename, imageCount: imageCount, imageErrors: imageErrors });
  } catch (e) { /* port disconnected */ }
}

function sendDonePdf(port, pdfFilename) {
  if (!port) return;
  try {
    port.postMessage({ done: true, pdf: true, filename: pdfFilename });
  } catch (e) { /* port disconnected */ }
}

// --- Badge Feedback ---

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

// --- Utilities ---

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
