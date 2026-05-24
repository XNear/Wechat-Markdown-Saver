// Shared action type constants (documentation reference)

const ACTIONS = {
  // Popup/Command -> SW
  SAVE_ARTICLE: 'SAVE_ARTICLE',       // Popup save button
  // SW -> Content Script
  EXTRACT: 'EXTRACT',                 // Request article extraction
  COPY_TO_CLIPBOARD: 'COPY_TO_CLIPBOARD', // Request clipboard copy
  // Content Script -> SW
  EXTRACT_RESULT: 'EXTRACT_RESULT',   // (unused, inline response)
  // SW -> Popup (port messages)
  STATUS: 'STATUS',                   // Progress update
  DONE: 'DONE',                       // Operation complete
  ERROR: 'ERROR',                     // Operation failed
};

const COMMANDS = {
  SAVE_TO_FOLDER: 'save-to-folder',       // Ctrl+Shift+S
  COPY_TO_CLIPBOARD: 'copy-to-clipboard', // Ctrl+Shift+C
};

const STORAGE_KEYS = {
  DIR_HANDLE: 'dirHandle',    // IndexedDB key for FileSystemDirectoryHandle
  SAVE_MODE: 'saveMode',      // chrome.storage key: 'folder' | 'clipboard' | 'both'
};
