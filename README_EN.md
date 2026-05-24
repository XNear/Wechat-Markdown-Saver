# WeChat Markdown Saver

Save WeChat official account articles as Markdown with one click. Images are downloaded locally. Works on Chrome, Edge, and Firefox.

<div align="center">
  <img width="654" height="491" alt="wechatmarkdown" src="https://github.com/user-attachments/assets/863efe7b-c06b-48a7-b7ad-03c81fac56e8" />
</div>

> 中文版：[README.md](README.md)

## Objective

Let everyone truly save WeChat articles into their own knowledge base.

---

## Features

- **One-click save** — Click a button or press a shortcut. Article + images are written directly to a local folder. No popups, no unzipping.
- **Direct folder writing** — Uses the File System Access API (Chrome / Edge) to save articles directly to a directory of your choice.
- **Markdown output** — Preserves titles, authors, dates, code blocks, tables, and more. Includes YAML frontmatter.
- **Local images** — All images are automatically downloaded and referenced with relative paths in the Markdown.
- **Dual output structure** — Supports "Simple" and "Obsidian" directory layouts.
- **Copy to clipboard** — Copy Markdown content directly to the clipboard (images retain remote URLs). Paste into Notion, Obsidian, etc.
- **Save as PDF** — Generate a beautifully formatted PDF and save it to a local folder with one click.
- **Bilingual UI** — Real-time switching between Chinese / English.
- **Keyboard shortcuts** — All three operations support customizable shortcuts.
- **URL input** — Paste an article link to save in the background without leaving the current page.

---

## Installation

### Chrome / Edge

1. Download `wechat-md-saver-chrome-x.x.x.zip` or `wechat-md-saver-edge-x.x.x.zip` from the [latest Release](https://github.com/XNear/wechat-markdown-saver/releases)
2. Unzip to any folder
3. Open `chrome://extensions/` (Chrome) or `edge://extensions/` (Edge)
4. Enable "Developer mode" in the top right
5. Click "Load unpacked" and select the unzipped folder

### Firefox

1. Download `wechat-md-saver-firefox-x.x.x.zip` from the [latest Release](https://github.com/XNear/wechat-markdown-saver/releases)
2. Unzip to any folder
3. Open `about:debugging#/runtime/this-firefox`
4. Click "Load Temporary Add-on"
5. Select `manifest.json` in the unzipped folder

> **Note**: Firefox does not support the File System Access API. Articles will be downloaded as zip files rather than written directly to a folder. Use Chrome or Edge for full folder write support.

---

## Usage

### Basic Operation

1. Open any WeChat official account article (`mp.weixin.qq.com/s/...`)
2. Click the extension icon in the browser toolbar
3. Click a button or use a keyboard shortcut

### Three Save Modes

| Operation | Shortcut | Description |
|-----------|----------|-------------|
| **Save to Folder** | `Ctrl+Shift+S` | Extract article → download images → write to local folder |
| **Copy to Clipboard** | `Ctrl+Shift+C` | Convert to Markdown → copy to clipboard (images keep remote URLs) |
| **Save as PDF** | `Ctrl+Shift+P` | Generate formatted PDF → save to local folder |

### URL Input Save

Paste an article URL into the input field at the top of the popup and click "Save". The extension will open the article in the background, extract the content, save it, and automatically close the tab when done.

---

## Output Structure

### Simple Mode

```
your-folder/
└── Article_Title_xxx/
    ├── article.md
    └── images/
        ├── image1.png
        ├── image2.jpg
        └── ...
```

### Obsidian Mode

```
your-folder/
└── Article_Title_xxx/
    ├── Article Title.md
    └── assets/
        └── Article Title/
            ├── image1.png
            ├── image2.jpg
            └── ...
```

---

## Settings

Right-click the extension icon → "Options", or click the "Settings" link in the popup.

### Language

Supports real-time switching between **English** and **中文**.

### Save Folder

Choose a local folder as the default save location. For multi-device sync, consider selecting a folder inside Dropbox, OneDrive, or iCloud.

### Output Structure

- **Simple Mode**: `images/` folder alongside `article.md`
- **Obsidian Mode**: `assets/Article Title/` nested structure, ideal for Obsidian users

### Default Save Mode

- **Save to Folder**: Download images and write to local disk
- **Copy to Clipboard**: Copy Markdown text (images retain remote URLs)
- **Both**: Save to folder and copy to clipboard

### Keyboard Shortcuts

You can customize shortcuts in your browser's extension management page:
- Chrome: `chrome://extensions/shortcuts`
- Edge: `edge://extensions/shortcuts`
- Firefox: `about:addons` → Gear icon → "Manage Extension Shortcuts"

---

## Development

### Project Structure

```
wechat-markdown-saver/
├── manifest.json              # Chrome manifest
├── manifest.edge.json         # Edge manifest
├── manifest.firefox.json      # Firefox manifest
├── background/
│   └── service-worker.js      # Background service: message routing, PDF generation, zip fallback
├── offscreen/
│   ├── offscreen.html         # Offscreen document page
│   └── offscreen.js           # Handle persistence, image download, file writing
├── content/
│   ├── content-script.js      # Message listener, PDF fallback printing
│   ├── extractor.js           # DOM extraction + HTML cleaning
│   ├── turndown-config.js     # Turndown custom rules
│   └── post-processor.js      # Markdown post-processing (CJK spacing, heading levels)
├── popup/
│   ├── popup.html             # Popup UI
│   ├── popup.js               # Popup logic
│   └── popup.css              # Popup styles
├── options/
│   ├── options.html           # Settings page
│   ├── options.js             # Settings logic
│   └── options.css            # Settings styles
├── shared/
│   ├── browser.js             # Cross-browser compatibility layer
│   ├── i18n.js                # Internationalization module
│   └── messages.js            # Message type constants
├── lib/
│   ├── turndown.min.js        # HTML to Markdown converter
│   └── jszip.min.js           # Zip packaging (fallback)
├── _locales/
│   ├── en/messages.json       # Chrome i18n English
│   └── zh_CN/messages.json    # Chrome i18n Chinese
├── icons/                     # Extension icons
├── build.ps1                  # Windows build script
├── build.sh                   # Unix build script
└── build.bat                  # Windows batch build
```

### Build

```bash
# Windows PowerShell
.\build.ps1

# Unix / macOS
bash build.sh

# Specify version
.\build.ps1 -Version "2.2.0"
```

Build output is in the `dist/` directory, with one unpacked folder + one zip archive per browser.

### Tech Stack

- Vanilla JavaScript (no build tool dependencies)
- Chrome Extension Manifest V3
- [Turndown.js](https://github.com/mixmark-io/turndown) — HTML to Markdown conversion
- [JSZip](https://stuk.github.io/jszip/) — Zip file packaging
- File System Access API — Direct folder writing
- Chrome Offscreen Documents API — Persistent handle storage
- Chrome Debugger API — Silent PDF generation
- IndexedDB — Directory handle persistence

---

## License

MIT
