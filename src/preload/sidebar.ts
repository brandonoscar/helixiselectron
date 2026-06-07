import { contextBridge, ipcRenderer } from 'electron'

/**
 * Minimal `chrome.*` shim for the Helixis Copilot side panel.
 *
 * The panel is the same UI shipped as the Helixis Copilot browser extension
 * (panel.html / panel.css / panel.js). Inside Helixis it runs as a native
 * WebContentsView rather than an extension side panel, so the handful of
 * extension APIs it relies on are reimplemented here on top of the app's IPC:
 *
 *   chrome.storage.local   → persisted in the main process (sidebar-state.json)
 *   chrome.tabs.query      → the active tab of the owning window
 *   chrome.scripting       → runs the supplied function in the active page
 *   chrome.tabs.sendMessage→ unavailable here; resolves empty so panel.js falls
 *                            back to scripting.executeScript (its designed path)
 *
 * This lets the extension's panel.js run unchanged.
 */

interface ActiveTab {
  id: number
  url: string
  title: string
}

const chromeShim = {
  runtime: {
    // panel.js reads this in the sendMessage callback; we never set an error.
    lastError: null as { message: string } | null
  },
  storage: {
    local: {
      get: (keys: string[] | string) =>
        ipcRenderer.invoke('sidebar:storage:get', normalizeKeys(keys)) as Promise<
          Record<string, unknown>
        >,
      set: (patch: Record<string, unknown>) =>
        ipcRenderer.invoke('sidebar:storage:set', patch) as Promise<void>
    }
  },
  tabs: {
    query: (_query: unknown) =>
      ipcRenderer.invoke('sidebar:active-tab').then((tab: ActiveTab | null) =>
        tab ? [tab] : []
      ),
    // No per-tab content-script messaging in the embedded panel — signal "no
    // response" so panel.js uses its scripting.executeScript fallback.
    sendMessage: (
      _tabId: number,
      _msg: unknown,
      cb: (response: unknown) => void
    ): void => {
      cb(undefined)
    }
  },
  scripting: {
    executeScript: async ({
      func,
      args
    }: {
      target: { tabId: number }
      func: (...a: unknown[]) => unknown
      args?: unknown[]
    }) => {
      const argList = (args ?? []).map((a) => JSON.stringify(a)).join(',')
      const code = `(${func.toString()})(${argList})`
      const result = await ipcRenderer.invoke('sidebar:exec', code)
      return [{ result }]
    }
  }
}

function normalizeKeys(keys: string[] | string): string[] {
  return Array.isArray(keys) ? keys : [keys]
}

contextBridge.exposeInMainWorld('chrome', chromeShim)
