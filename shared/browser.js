// shared/browser.js — Cross-browser compatibility layer
// Detects the running browser and normalizes API differences between
// Chrome, Firefox, and Edge for the rest of the extension.

(function () {
  // Firefox exposes a global `browser` object; Chrome/Edge use `chrome`.
  // We also check for the `InstallTrigger` legacy Firefox sentinel (deprecated
  // but still present in Firefox user-agent patterns).
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const ua = (nav.userAgent || '').toLowerCase();

  // In a service worker, `navigator` is available but `window` is not.
  // In a content / page script, `window.browser` or `window.chrome` is set.
  const hasBrowserGlobal = typeof globalThis.browser !== 'undefined';
  const hasChromeGlobal  = typeof globalThis.chrome  !== 'undefined';

  const IS_FIREFOX = hasBrowserGlobal && ua.includes('firefox');
  const IS_EDGE    = !IS_FIREFOX && ua.includes('edg/');
  const IS_CHROME  = !IS_FIREFOX && !IS_EDGE;

  // Unified API object — default to chrome, normalized per browser
  const api = hasBrowserGlobal ? globalThis.browser : globalThis.chrome;

  // --- debugger API normalization ---
  //
  // Chrome  : debugger.attach({tabId}, version) → sendCommand({tabId}, method, params)
  // Firefox : debugger.attach(tabId)            → sendCommand(tabId, method, params)
  //
  // We expose a single `debuggerAttach(tabId)` and `debuggerSendCommand(tabId, method, params)`
  // that works on both platforms.

  function debuggerAttach(tabId) {
    if (IS_FIREFOX) {
      // Firefox expects the tabId as a bare argument
      return api.debugger.attach(String(tabId), '1.3');
    }
    // Chrome / Edge expect an object
    return api.debugger.attach({ tabId: tabId }, '1.3');
  }

  function debuggerDetach(tabId) {
    if (IS_FIREFOX) {
      return api.debugger.detach(String(tabId));
    }
    return api.debugger.detach({ tabId: tabId });
  }

  function debuggerSendCommand(tabId, method, params) {
    if (IS_FIREFOX) {
      return api.debugger.sendCommand(String(tabId), method, params || {});
    }
    return api.debugger.sendCommand({ tabId: tabId }, method, params || {});
  }

  // --- action API ---
  //
  // Chrome MV3  : chrome.action
  // Firefox MV3  : browser.action (or browser.browserAction for MV2 compat)
  const actionApi = api.action || api.browserAction;

  function setBadgeText(opts) {
    return actionApi.setBadgeText(opts);
  }
  function setBadgeBackgroundColor(opts) {
    return actionApi.setBadgeBackgroundColor(opts);
  }

  // --- downloads API ---
  //
  // Both Chrome and Firefox support chrome.downloads / browser.downloads.
  // Firefox requires the `downloads` permission.

  // --- Export ---

  globalThis.__WMS_BROWSER__ = {
    IS_FIREFOX,
    IS_EDGE,
    IS_CHROME,
    api,
    action: actionApi,
    debugger: {
      attach: debuggerAttach,
      detach: debuggerDetach,
      sendCommand: debuggerSendCommand
    },
    setBadgeText,
    setBadgeBackgroundColor
  };

  // Also attach helpers to the global scope for convenience
  globalThis.WMS_IS_FIREFOX = IS_FIREFOX;
  globalThis.WMS_IS_EDGE    = IS_EDGE;
  globalThis.WMS_IS_CHROME  = IS_CHROME;
})();
