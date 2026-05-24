// content-script.js — Message listener, clipboard copy, PDF print, toast notification

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'EXTRACT') {
    handleExtract().then(sendResponse).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (message.action === 'COPY_TO_CLIPBOARD') {
    copyToClipboard(message.text).then(() => {
      showToast(t('contentCopySuccess'), false);
      sendResponse({ success: true });
    }).catch(err => {
      showToast(t('contentCopyError') + ': ' + err.message, true);
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (message.action === 'PRINT_PDF_FALLBACK') {
    openPrintDialog(message.title, message.contentHtml);
    sendResponse({ success: true });
    return false;
  }
});

async function handleExtract() {
  await scrollToLoadImages();
  const article = extractArticle();

  if (!article.contentHtml) {
    throw new Error(t('swExtractionFailed'));
  }

  let markdown = convertToMarkdown(article.contentHtml);
  markdown = postProcessMarkdown(markdown);

  return {
    success: true,
    payload: {
      title: article.title,
      author: article.author,
      publishDate: article.publishDate,
      markdown: markdown,
      contentHtml: article.contentHtml,
      images: article.imageMap,
      sourceUrl: window.location.href
    }
  };
}

function openPrintDialog(title, contentHtml) {
  const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const printHtml = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<title>' + esc(title) + '</title>\n<style>\n'
    + '@page { margin: 15mm; size: A4; }\n'
    + '* { box-sizing: border-box; }\n'
    + 'body { max-width: 750px; margin: 0 auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 16px; line-height: 1.8; color: #333; background: #fff; }\n'
    + '.article-header { margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #07c160; }\n'
    + '.article-title { font-size: 24px; font-weight: 700; line-height: 1.4; color: #1a1a1a; margin-bottom: 12px; }\n'
    + '@media print { body { padding: 0; } }\n'
    + '</style>\n</head>\n<body>\n'
    + '<div class="article-header"><h1 class="article-title">' + esc(title) + '</h1></div>\n'
    + contentHtml + '\n'
    + '<script>setTimeout(function(){ window.print(); }, 500);<\x2fscript>\n'
    + '</body>\n</html>';

  const blob = new Blob([printHtml], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
}

function showToast(message, isError) {
  const existing = document.getElementById('_wms_toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = '_wms_toast';
  toast.textContent = message;
  toast.style.cssText = [
    'position: fixed', 'top: 16px', 'right: 16px', 'z-index: 999999',
    'padding: 10px 20px', 'border-radius: 8px', 'font-size: 14px',
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    'color: #fff',
    'background: ' + (isError ? '#ff4d4f' : '#07c160'),
    'box-shadow: 0 4px 12px rgba(0,0,0,0.2)',
    'transition: opacity 0.3s', 'opacity: 1', 'pointer-events: none'
  ].join(';');

  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}
