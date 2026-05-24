# WeChat Markdown Saver / 微信 Markdown 保存助手

一键将微信公众号文章保存为 Markdown 格式，图片自动下载到本地文件夹。支持 Chrome / Edge / Firefox。

Save WeChat official account articles as Markdown with one click. Images are downloaded locally. Works on Chrome, Edge, and Firefox.

## 功能 Features

- **一键保存** — 点击按钮或按快捷键，文章 + 图片直接写入本地文件夹，无需弹窗、无需解压
- **直接写入文件夹** — 使用 File System Access API（Chrome / Edge），文章直接保存到你选择的目录
- **Markdown 输出** — 保留标题、作者、日期、代码块、表格等完整格式，包含 YAML frontmatter
- **图片本地化** — 所有图片自动下载到本地，Markdown 中的链接替换为相对路径
- **双输出结构** — 支持「简单模式」和「Obsidian 模式」两种目录结构
- **复制到剪贴板** — 将 Markdown 内容直接复制到剪贴板（图片保留远程链接），可粘贴到 Notion、Obsidian 等
- **保存为 PDF** — 一键生成排版精美的 PDF 并保存到本地文件夹
- **中英双语** — 界面支持中文 / English 实时切换
- **快捷键支持** — 三种操作均支持自定义快捷键
- **URL 输入** — 支持粘贴文章链接后台保存，无需离开当前页面

---

## 安装 Installation

### Chrome / Edge

1. 下载 [最新 Release](https://github.com/XNear/wechat-markdown-saver/releases) 中的 `wechat-md-saver-chrome-x.x.x.zip` 或 `wechat-md-saver-edge-x.x.x.zip`
2. 解压到任意文件夹
3. 打开 `chrome://extensions/`（Chrome）或 `edge://extensions/`（Edge）
4. 开启右上角「开发者模式」
5. 点击「加载已解压的扩展」，选择解压后的文件夹

### Firefox

1. 下载 [最新 Release](https://github.com/XNear/wechat-markdown-saver/releases) 中的 `wechat-md-saver-firefox-x.x.x.zip`
2. 解压到任意文件夹
3. 打开 `about:debugging#/runtime/this-firefox`
4. 点击「临时载入附加组件」
5. 选择解压后文件夹中的 `manifest.json`

> **注意**：Firefox 不支持 File System Access API，文章将以 zip 文件下载而非直接写入文件夹。如需完整的文件夹直写功能，请使用 Chrome 或 Edge。

---

## 使用 Usage

### 基本操作

1. 打开任意微信公众号文章（`mp.weixin.qq.com/s/...`）
2. 点击浏览器工具栏中的扩展图标
3. 点击对应按钮或使用快捷键

### 三个保存模式

| 操作 | 快捷键 | 说明 |
|------|--------|------|
| **保存到文件夹** | `Ctrl+Shift+S` | 提取文章 → 下载图片 → 写入本地文件夹 |
| **复制到剪贴板** | `Ctrl+Shift+C` | 转换 Markdown → 复制到剪贴板（图片保留远程链接） |
| **保存为 PDF** | `Ctrl+Shift+P` | 生成排版优化的 PDF → 保存到本地文件夹 |

### URL 输入保存

在弹窗顶部的 URL 输入框中粘贴文章链接，点击「保存」按钮。扩展将在后台打开文章、提取内容并保存，完成后自动关闭标签页。

---

## 输出结构 Output Structure

### 简单模式 Simple

```
你的文件夹/
└── 文章标题_xxx/
    ├── article.md
    └── images/
        ├── image1.png
        ├── image2.jpg
        └── ...
```

### Obsidian 模式

```
你的文件夹/
└── 文章标题_xxx/
    ├── 文章标题.md
    └── assets/
        └── 文章标题/
            ├── image1.png
            ├── image2.jpg
            └── ...
```

---

## 设置 Settings

右键扩展图标 →「选项」，或点击弹窗中的「设置」链接。

### 语言

支持 **English** 和 **中文** 实时切换。

### 保存文件夹

选择一个本地文件夹作为默认保存位置。建议选择 Dropbox / OneDrive / iCloud 等同步盘中的文件夹，实现多设备同步。

### 输出结构

- **简单模式**：`images/` 文件夹与 `article.md` 并列
- **Obsidian 模式**：`assets/文章标题/` 嵌套结构，适合 Obsidian 用户

### 默认保存模式

- **保存到文件夹**：下载图片并写入本地
- **复制到剪贴板**：复制 Markdown 文本（图片保留远程链接）
- **两者都做**：同时保存到文件夹并复制到剪贴板

### 快捷键

你可以在浏览器扩展管理页面修改快捷键：
- Chrome：`chrome://extensions/shortcuts`
- Edge：`edge://extensions/shortcuts`
- Firefox：`about:addons` → 齿轮图标 →「管理扩展快捷键」

---

## 开发 Development

### 项目结构

```
wechat-markdown-saver/
├── manifest.json              # Chrome 清单
├── manifest.edge.json         # Edge 清单
├── manifest.firefox.json      # Firefox 清单
├── background/
│   └── service-worker.js      # 后台服务：文件夹写入、图片下载、PDF 生成
├── content/
│   ├── content-script.js      # 消息监听、PDF 降级打印
│   ├── extractor.js           # DOM 提取 + HTML 清洗
│   ├── turndown-config.js     # Turndown 自定义规则
│   └── post-processor.js      # Markdown 后处理（CJK 间距、标题层级）
├── popup/
│   ├── popup.html             # 弹窗界面
│   ├── popup.js               # 弹窗逻辑
│   └── popup.css              # 弹窗样式
├── options/
│   ├── options.html           # 设置页面
│   ├── options.js             # 设置逻辑
│   └── options.css            # 设置样式
├── shared/
│   ├── browser.js             # 浏览器兼容层
│   ├── i18n.js                # 多语言模块
│   └── messages.js            # 消息类型常量
├── lib/
│   ├── turndown.min.js        # HTML → Markdown 转换
│   └── jszip.min.js           # Zip 打包（降级方案）
├── _locales/
│   ├── en/messages.json       # Chrome i18n 英文
│   └── zh_CN/messages.json    # Chrome i18n 中文
├── icons/                     # 扩展图标
├── build.ps1                  # Windows 构建脚本
├── build.sh                   # Unix 构建脚本
└── build.bat                  # Windows 批处理构建
```

### 打包 Build

```bash
# Windows PowerShell
.\build.ps1

# Unix / macOS
bash build.sh

# 指定版本号
.\build.ps1 -Version "2.2.0"
```

构建产物在 `dist/` 目录下，每个浏览器一个解压文件夹 + 一个 zip 压缩包。

### 技术栈

- 纯 JavaScript（无构建工具依赖）
- Chrome Extension Manifest V3
- [Turndown.js](https://github.com/mixmark-io/turndown) — HTML 到 Markdown 转换
- [JSZip](https://stuk.github.io/jszip/) — Zip 文件打包
- File System Access API — 文件夹直写
- Chrome Debugger API — 静默 PDF 生成
- IndexedDB — 文件夹句柄持久化存储

---

## Credits

- [Turndown.js](https://github.com/mixmark-io/turndown) — HTML to Markdown converter
- [JSZip](https://stuk.github.io/jszip/) — Create, read and edit .zip files

## License

MIT
