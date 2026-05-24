// turndown-config.js — TurndownService instance with WeChat-specific custom rules

const turndownService = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**',
  linkStyle: 'inlined',
  linkReferenceStyle: 'full'
});

// Remove tracking pixels (1x1 images, read-stat images)
turndownService.addRule('removeTracking', {
  filter: function (node) {
    if (node.nodeName !== 'IMG') return false;
    const src = node.getAttribute('src') || '';
    return src.includes('mp.weixin.qq.com/mp/read') || src.includes('mmbiz.qpic.cn/mmbiz_png/0');

  },
  replacement: function () {
    return '';
  }
});

// Handle WeChat emoji images (replace with alt text)
turndownService.addRule('wechatEmoji', {
  filter: function (node) {
    if (node.nodeName !== 'IMG') return false;
    const src = node.getAttribute('src') || '';
    const alt = node.getAttribute('alt') || '';
    return src.includes('res.wx.qq.com') && alt;
  },
  replacement: function (content, node) {
    return node.getAttribute('alt') || '';
  }
});

// Handle video embeds (Tencent/WeChat video iframes)
turndownService.addRule('wechatVideo', {
  filter: function (node) {
    if (node.nodeName === 'IFRAME') {
      const src = node.getAttribute('src') || '';
      return src.includes('v.qq.com') || src.includes('video.weixin.qq.com');
    }
    if (node.nodeName === 'VIDEO') return true;
    if (node.classList && node.classList.contains('video_iframe')) return true;
    return false;
  },
  replacement: function (content, node) {
    let src = '';
    if (node.nodeName === 'IFRAME') {
      src = node.getAttribute('src') || '';
    } else if (node.nodeName === 'VIDEO') {
      src = node.getAttribute('src') || node.querySelector('source')?.getAttribute('src') || '';
    }
    const title = node.getAttribute('data-title') || node.getAttribute('title') || 'Video';
    if (src) {
      return '\n\n> [VIDEO: ' + title + '](' + src + ')\n\n';
    }
    return '\n\n> [VIDEO: ' + title + ']\n\n';
  }
});

// Handle audio/voice embeds
turndownService.addRule('wechatAudio', {
  filter: function (node) {
    if (node.nodeName === 'AUDIO') return true;
    if (node.nodeName === 'MP-VOICE') return true;
    if (node.classList && node.classList.contains('audio_area')) return true;
    return false;
  },
  replacement: function (content, node) {
    let title = 'Audio';
    if (node.nodeName === 'MP-VOICE') {
      title = node.getAttribute('title') || node.textContent.trim() || 'Voice message';
    } else if (node.nodeName === 'AUDIO') {
      title = node.getAttribute('title') || 'Audio';
    }
    const src = node.getAttribute('src') || '';
    if (src) {
      return '\n\n> [AUDIO: ' + title + '](' + src + ')\n\n';
    }
    return '\n\n> [AUDIO: ' + title + ']\n\n';
  }
});

// Handle WeChat card/product embeds
turndownService.addRule('wechatCard', {
  filter: function (node) {
    const tagName = node.nodeName;
    if (tagName === 'MP-COMMON-PRODUCT' || tagName === 'MP-COMMON-CARD' ||
        tagName === 'MP-COMMON-SHOP' || tagName === 'MP-COMMON-CPSPRODUCT') {
      return true;
    }
    if (node.classList && (node.classList.contains('card_container') || node.classList.contains('product_card'))) {
      return true;
    }
    return false;
  },
  replacement: function (content, node) {
    let title = 'Embedded content';
    const dataTitle = node.getAttribute('data-title');
    if (dataTitle) title = dataTitle;
    return '\n\n> [CARD: ' + title + ']\n\n';
  }
});

// Handle code blocks with language detection
turndownService.addRule('wechatCodeBlock', {
  filter: function (node) {
    return node.nodeName === 'PRE' &&
      (node.className.includes('prettyprint') || node.className.includes('language-') || node.className.includes('lang-'));
  },
  replacement: function (content, node) {
    let lang = '';
    const cls = node.className;
    const langMatch = cls.match(/(?:lang-|language-)(\w+)/i);
    if (langMatch) lang = langMatch[1];
    const code = node.querySelector('code');
    const text = code ? code.textContent : node.textContent;
    return '\n\n```' + lang + '\n' + text.trim() + '\n```\n\n';
  }
});

// Preserve complex tables as raw HTML
turndownService.addRule('preserveComplexTables', {
  filter: function (node) {
    return node.hasAttribute && node.hasAttribute('data-preserve-html');
  },
  replacement: function (content, node) {
    return '\n\n' + node.outerHTML + '\n\n';
  }
});

// Convert HTML to Markdown
function convertToMarkdown(html) {
  return turndownService.turndown(html);
}
