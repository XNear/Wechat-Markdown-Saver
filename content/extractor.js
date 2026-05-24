// extractor.js — WeChat article DOM extraction and HTML cleaning

function extractArticle() {
  const title = extractTitle();
  const author = extractAuthor();
  const publishDate = extractPublishDate();
  const contentHtml = cleanContentHtml();
  const imageMap = collectImages(contentHtml);

  return {
    title: title,
    author: author,
    publishDate: publishDate,
    contentHtml: contentHtml,
    imageMap: imageMap
  };
}

function extractTitle() {
  const selectors = ['#activity-name', 'h1.rich_media_title', '.rich_media_title'];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.textContent.trim()) {
      return el.textContent.trim();
    }
  }
  return document.title.replace(/\s*[-_|]\s*.*$/, '').trim() || 'Untitled';
}

function extractAuthor() {
  const selectors = ['#js_name', 'span.rich_media_meta_text', '.rich_media_meta_text'];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.textContent.trim()) {
      return el.textContent.trim();
    }
  }
  const metaAuthor = document.querySelector('meta[name="author"]');
  if (metaAuthor) return metaAuthor.content.trim();
  return '';
}

function extractPublishDate() {
  const el = document.querySelector('#publish_time');
  if (el && el.textContent.trim()) {
    return el.textContent.trim();
  }
  const metaDate = document.querySelector('meta[property="article:published_time"]');
  if (metaDate) {
    try {
      return new Date(metaDate.content).toISOString().replace('T', ' ').substring(0, 19);
    } catch (e) { /* fall through */ }
  }
  const timeEl = document.querySelector('.rich_media_meta_text time');
  if (timeEl) return timeEl.textContent.trim();
  return '';
}

function cleanContentHtml() {
  const contentEl = document.querySelector('#js_content') || document.querySelector('div.rich_media_content');
  if (!contentEl) return '';

  const clone = contentEl.cloneNode(true);

  // Remove hidden elements
  clone.querySelectorAll('[style*="visibility: hidden"], [style*="display: none"], [style*="display:none"], [style*="opacity: 0"], [style*="opacity:0"]').forEach(el => el.remove());

  // Remove tracking images (invisible 1x1 pixels)
  clone.querySelectorAll('img').forEach(img => {
    const w = parseInt(img.getAttribute('width') || '0');
    const h = parseInt(img.getAttribute('height') || '0');
    const src = img.getAttribute('data-src') || img.getAttribute('src') || '';
    if ((w === 1 && h === 1) || src.includes('mp.weixin.qq.com/mp/read')) {
      img.remove();
      return;
    }
    // Convert data-src to src for Turndown (use setAttribute for reliable serialization)
    const dataSrc = img.getAttribute('data-src');
    if (dataSrc) {
      img.setAttribute('src', dataSrc);
      img.removeAttribute('data-src');
    }
  });

  // Remove scripts, styles, iframes (tracking)
  clone.querySelectorAll('script, style, iframe[width="0"], iframe[height="0"]').forEach(el => el.remove());

  // Unwrap section wrappers (keep children)
  clone.querySelectorAll('section').forEach(section => {
    if (section.parentNode) {
      while (section.firstChild) {
        section.parentNode.insertBefore(section.firstChild, section);
      }
      section.remove();
    }
  });

  // Mark complex tables for preservation
  clone.querySelectorAll('table').forEach(table => {
    const hasMergedCells = table.querySelector('[colspan], [rowspan]');
    const colCount = Math.max(
      ...Array.from(table.querySelectorAll('tr')).map(tr => tr.querySelectorAll('td, th').length),
      0
    );
    if (hasMergedCells || colCount > 5) {
      table.setAttribute('data-preserve-html', 'true');
    }
  });

  // Remove empty spans (styling artifacts)
  clone.querySelectorAll('span').forEach(span => {
    if (!span.textContent.trim() && !span.querySelector('img, video, iframe')) {
      span.remove();
    }
  });

  return clone.innerHTML;
}

function collectImages(contentHtml) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = contentHtml;
  const images = tempDiv.querySelectorAll('img');
  const seenUrls = new Set();
  const imageMap = [];
  let index = 0;

  images.forEach(img => {
    const url = img.src || img.getAttribute('data-src') || '';
    if (!url || !url.startsWith('http')) return;
    // Skip tiny emoji icons from res.wx.qq.com (prefer alt text)
    if (url.includes('res.wx.qq.com') && img.getAttribute('alt')) return;

    if (seenUrls.has(url)) return;
    seenUrls.add(url);

    index++;
    const extMatch = url.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i);
    const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
    imageMap.push({
      url: url,
      filename: 'img-' + String(index).padStart(3, '0') + '.' + ext
    });
  });

  return imageMap;
}

// Scroll through the page to trigger lazy image loading
async function scrollToLoadImages() {
  const scrollStep = window.innerHeight * 0.8;
  let currentPos = 0;
  let lastHeight = 0;
  let stableCount = 0;

  while (stableCount < 2) {
    window.scrollTo(0, currentPos);
    await sleep(300);
    const newHeight = document.body.scrollHeight;
    if (newHeight === lastHeight) {
      stableCount++;
    } else {
      stableCount = 0;
      lastHeight = newHeight;
    }
    currentPos += scrollStep;
    if (currentPos >= newHeight) break;
  }

  // Scroll to very bottom to catch any remaining triggers
  window.scrollTo(0, document.body.scrollHeight);
  await sleep(500);
  window.scrollTo(0, 0);
  await sleep(200);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
