// shared/i18n.js — Unified i18n with manual language override support
// This module embeds all translations and provides a t() function.
// It respects user's language preference in chrome.storage.local,
// falling back to the browser/Chrome locale.

const MESSAGES = {
  en: {
    appName: 'WeChat Markdown Saver',
    appDescription: 'Save WeChat official account articles as Markdown — one shortcut to local folder',
    popupTitle: 'WeChat Markdown Saver',
    popupSubtitle: 'Save articles as Markdown',
    popupReady: 'Ready',
    popupWorking: 'Working...',
    popupDone: 'Done!',
    popupFailed: 'Failed',
    popupNotArticle: 'Not a WeChat article',
    popupNotArticleMsg: 'Navigate to a WeChat article page (mp.weixin.qq.com/s/...) and try again.',
    popupSaveBtn: 'Save to Folder',
    popupCopyBtn: 'Copy to Clipboard',
    popupPdfBtn: 'Save as PDF',
    popupShortcutsHint: 'Shortcuts:',
    popupSaveShortcut: 'Save',
    popupCopyShortcut: 'Copy',
    popupSettingsLink: 'Settings',
    popupSaveToFolder: 'Saving to folder...',
    popupCopyingToClipboard: 'Copying to clipboard...',
    popupSavingPdf: 'Opening print dialog...',
    popupCopied: 'Copied to clipboard',
    popupCopyFailed: 'Copy failed',
    popupConnectionLost: 'Connection lost. Please try again.',
    popupSaved: 'Saved: $1 ($2 images)',
    popupSavedWithErrors: 'Saved: $1 ($2 images, $3 failed)',
    popupPdfSaved: 'PDF saved: $1',
    popupPdfFailed: 'PDF generation failed, opening print dialog...',
    popupFolderNoSet: 'No folder set',
    popupFolderChange: 'Change',
    popupUrlPlaceholder: 'Paste WeChat article URL here...',
    popupUrlSaveBtn: 'Save',
    popupOrDivider: 'or save current page',
    optionsTitle: 'WeChat Markdown Saver — Settings',
    optionsHeading: 'WeChat Markdown Saver',
    optionsSubtitle: 'Save WeChat articles as Markdown with one shortcut',
    optionsFolderSection: 'Save Folder',
    optionsFolderDesc: 'Pick a folder on your computer. Articles will be saved here directly — no prompts, no zip extraction.',
    optionsFolderNotSelected: 'Not selected',
    optionsChooseFolderBtn: 'Choose Folder',
    optionsClearBtn: 'Clear',
    optionsFolderHint: 'Tip: pick a folder inside Dropbox / OneDrive / iCloud to sync articles across devices.',
    optionsFolderReady: 'Folder is ready. Press Ctrl+Shift+S on any WeChat article to save.',
    optionsFolderExpired: 'Permission expired — please re-select folder',
    optionsFolderNotSupported: 'Direct folder saving is not supported in this browser. Articles will download as zip files.',
    optionsFolderNotSupportedHint: 'For one-click save to folder, use Chrome or Edge.',
    optionsOutputSection: 'Output Structure',
    optionsOutputSimple: 'Simple — images/ folder alongside article.md',
    optionsOutputObsidian: 'Obsidian — assets/title/ nested structure',
    optionsOutputHint: 'Choose Obsidian mode if you use Obsidian for fewer broken image links.',
    optionsOutputSaved: 'Output structure saved',
    optionsShortcutsSection: 'Keyboard Shortcuts',
    optionsShortcutSaveDesc: 'Extracts the article, downloads images, and writes everything into your chosen folder. No popups, no zip.',
    optionsShortcutCopyDesc: 'Copies the full article as Markdown (images keep remote URLs). Paste into Notion, Obsidian, or any editor.',
    optionsShortcutPdfDesc: 'Opens the article in a print-ready page and triggers Save as PDF. Preserves original fonts, colors, and layout.',
    optionsShortcutNote: 'You can change shortcuts at',
    optionsModeSection: 'Default Save Mode',
    optionsModeFolder: 'Save to local folder (images downloaded)',
    optionsModeClipboard: 'Copy to clipboard (images keep remote URLs)',
    optionsModeBoth: 'Both — save to folder AND copy to clipboard',
    optionsFolderSelected: 'Folder selected: $1',
    optionsFolderCleared: 'Folder removed',
    optionsModeSaved: 'Mode saved',
    optionsAccessError: 'Could not access folder',
    optionsLanguageSection: 'Language / 语言',
    optionsLanguageEn: 'English',
    optionsLanguageZhCN: '中文 (Chinese)',
    optionsLanguageSaved: 'Language saved. Reload the popup to see changes.',
    contentCopySuccess: 'Copied to clipboard',
    contentCopyError: 'Copy failed',
    contentPdfTitle: ' — WeChat Article',
    swExtracting: 'Extracting article...',
    swDownloading: 'Downloading $1 images...',
    swDownloadingProgress: 'Downloading images ($1/$2)...',
    swWriting: 'Writing files...',
    swCreatingZip: 'Creating zip...',
    swFolderAccessLost: 'Folder access lost. Falling back to zip download...',
    swNoFolderSet: 'No folder set. Saving as zip download...',
    swDirectSaveFailed: 'Direct save failed. Falling back to zip...',
    swExtractionFailed: 'Could not find article content. Make sure you are on a WeChat article page.',
    swNotArticle: 'This page is not a WeChat article.',
    swOpeningArticle: 'Opening article...',
    swPageLoadTimeout: 'Page load timeout',
  },
  zh_CN: {
    appName: '微信 Markdown 保存助手',
    appDescription: '一键保存微信公众号文章为 Markdown，图片自动下载到本地',
    popupTitle: '微信 Markdown 保存助手',
    popupSubtitle: '保存公众号文章为 Markdown',
    popupReady: '就绪',
    popupWorking: '处理中...',
    popupDone: '完成！',
    popupFailed: '失败',
    popupNotArticle: '不是微信公众号文章',
    popupNotArticleMsg: '请打开一篇微信公众号文章（mp.weixin.qq.com/s/...）后再试。',
    popupSaveBtn: '保存到文件夹',
    popupCopyBtn: '复制到剪贴板',
    popupPdfBtn: '保存为 PDF',
    popupShortcutsHint: '快捷键：',
    popupSaveShortcut: '保存',
    popupCopyShortcut: '复制',
    popupSettingsLink: '设置',
    popupSaveToFolder: '正在保存到文件夹...',
    popupCopyingToClipboard: '正在复制到剪贴板...',
    popupSavingPdf: '正在打开打印对话框...',
    popupCopied: '已复制到剪贴板',
    popupCopyFailed: '复制失败',
    popupConnectionLost: '连接断开，请重试。',
    popupSaved: '已保存：$1（$2 张图片）',
    popupSavedWithErrors: '已保存：$1（$2 张图片，$3 张失败）',
    popupPdfSaved: 'PDF 已保存：$1',
    popupPdfFailed: 'PDF 生成失败，正在打开打印对话框...',
    popupFolderNoSet: '未设置文件夹',
    popupFolderChange: '更换',
    popupUrlPlaceholder: '粘贴微信公众号文章链接...',
    popupUrlSaveBtn: '保存',
    popupOrDivider: '或保存当前页面',
    optionsTitle: '微信 Markdown 保存助手 — 设置',
    optionsHeading: '微信 Markdown 保存助手',
    optionsSubtitle: '一键保存公众号文章为 Markdown',
    optionsFolderSection: '保存文件夹',
    optionsFolderDesc: '选择一个本地文件夹，文章将直接保存到这里——无需弹窗、无需解压。',
    optionsFolderNotSelected: '未选择',
    optionsChooseFolderBtn: '选择文件夹',
    optionsClearBtn: '清除',
    optionsFolderHint: '提示：选择 Dropbox / OneDrive / iCloud 中的文件夹可实现多设备同步。',
    optionsFolderReady: '文件夹已就绪。在任意公众号文章中按 Ctrl+Shift+S 即可保存。',
    optionsFolderExpired: '权限已过期——请重新选择文件夹',
    optionsFolderNotSupported: '此浏览器不支持直接保存到文件夹，文章将以 zip 文件下载。',
    optionsFolderNotSupportedHint: '如需一键保存到文件夹，请使用 Chrome 或 Edge。',
    optionsOutputSection: '输出结构',
    optionsOutputSimple: '简单 — images/ 文件夹与 article.md 并列',
    optionsOutputObsidian: 'Obsidian — assets/标题/ 嵌套结构',
    optionsOutputHint: '如果你使用 Obsidian 做笔记，选择此选项可以减少图片链接失效。',
    optionsOutputSaved: '输出结构已保存',
    optionsShortcutsSection: '快捷键',
    optionsShortcutSaveDesc: '提取文章内容，下载所有图片，直接写入你选择的文件夹。无需弹窗、无需解压。',
    optionsShortcutCopyDesc: '将完整文章转换为 Markdown 并复制到剪贴板（图片保留远程链接）。',
    optionsShortcutPdfDesc: '在打印优化页面中打开文章并触发"保存为 PDF"。保留原始字体、颜色和版式。',
    optionsShortcutNote: '可以在以下页面修改快捷键：',
    optionsModeSection: '默认保存模式',
    optionsModeFolder: '保存到本地文件夹（下载图片）',
    optionsModeClipboard: '复制到剪贴板（图片保留远程链接）',
    optionsModeBoth: '两者都做——保存到文件夹并复制到剪贴板',
    optionsFolderSelected: '已选择文件夹：$1',
    optionsFolderCleared: '文件夹已清除',
    optionsModeSaved: '模式已保存',
    optionsAccessError: '无法访问文件夹',
    optionsLanguageSection: '语言',
    optionsLanguageEn: 'English',
    optionsLanguageZhCN: '中文',
    optionsLanguageSaved: '语言已切换。',
    contentCopySuccess: '已复制到剪贴板',
    contentCopyError: '复制失败',
    contentPdfTitle: '——微信公众号文章',
    swExtracting: '正在提取文章内容...',
    swDownloading: '正在下载 $1 张图片...',
    swDownloadingProgress: '正在下载图片（$1/$2）...',
    swWriting: '正在写入文件...',
    swCreatingZip: '正在创建 zip 文件...',
    swFolderAccessLost: '文件夹访问权限丢失，回退到 zip 下载...',
    swNoFolderSet: '未设置保存文件夹，使用 zip 方式下载...',
    swDirectSaveFailed: '直接保存失败，回退到 zip...',
    swExtractionFailed: '找不到文章内容，请确认你在公众号文章页面。',
    swNotArticle: '当前页面不是公众号文章。请打开一篇公众号文章后再试。',
    swOpeningArticle: '正在打开文章...',
    swPageLoadTimeout: '页面加载超时',
  }
};

let _currentLang = null;
let _ready = false;
const _onReadyCallbacks = [];

function _applyLang(lang) {
  _currentLang = MESSAGES[lang] ? lang : 'en';
  _ready = true;
  _onReadyCallbacks.forEach(cb => cb());
  _onReadyCallbacks.length = 0;
}

// Initialize: read user preference, fall back to browser locale
(function init() {
  try {
    chrome.storage.local.get(['uiLanguage'], (result) => {
      if (result.uiLanguage && MESSAGES[result.uiLanguage]) {
        _applyLang(result.uiLanguage);
      } else {
        const browserLang = chrome.i18n.getUILanguage ? chrome.i18n.getUILanguage() : navigator.language;
        _applyLang(browserLang.startsWith('zh') ? 'zh_CN' : 'en');
      }
    });
  } catch (e) {
    // Not in extension context (unlikely), fall back
    _applyLang('en');
  }
})();

// Public translation function
function t(key, replacements) {
  const msgs = MESSAGES[_currentLang] || MESSAGES.en;
  let msg = msgs[key];
  if (msg === undefined) {
    // Fall back to chrome.i18n if available
    try { msg = chrome.i18n.getMessage(key); } catch (e) { msg = key; }
    if (!msg) msg = key;
  }
  if (replacements) {
    replacements.forEach((r, i) => { msg = msg.replace('$' + (i + 1), String(r)); });
  }
  return msg;
}

// Apply data-i18n attributes in the DOM
function applyI18n(root) {
  root = root || document;
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translated = t(key);
    if (translated && translated !== key) {
      if (el.tagName === 'TITLE') document.title = translated;
      else el.textContent = translated;
    }
  });
}

// Get current language code
function getCurrentLang() {
  return _currentLang || 'en';
}

// Check if i18n is ready
function isI18nReady() {
  return _ready;
}

// Register callback for when i18n is ready
function onI18nReady(cb) {
  if (_ready) { cb(); return; }
  _onReadyCallbacks.push(cb);
}

// Switch language at runtime (for immediate UI update)
function switchLang(lang) {
  if (MESSAGES[lang]) {
    _currentLang = lang;
    _ready = true;
  }
}
