import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { controllerForSender } from './windows'
import { getSettings, setSettings, SEARCH_ENGINES } from './settings'
import { query as queryHistory, clearHistory } from './history'
import * as bookmarks from './bookmarks'
import { browserSession } from './sessions'
import { readJSON, writeJSON } from './store'
import type { AppInfo, CreateTabOptions, FindOptions, Settings } from '../shared/types'

/** Persistent store backing the side panel's `chrome.storage.local` shim. */
const SIDEBAR_STATE_FILE = 'sidebar-state.json'

/** Resolve the TabManager / DownloadManager for the window that sent the IPC. */
function tabsFor(e: IpcMainInvokeEvent) {
  return controllerForSender(e.sender)?.tabManager ?? null
}
function downloadsFor(e: IpcMainInvokeEvent) {
  return controllerForSender(e.sender)?.downloads ?? null
}

export function registerIpc(cdpPort: number | null): void {
  ipcMain.handle('shell:getState', (e) => tabsFor(e)?.getState() ?? { tabs: [], activeTabId: null })

  ipcMain.handle('app:info', (): AppInfo => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    cdpPort
  }))

  ipcMain.handle('tabs:create', (e, opts: CreateTabOptions) =>
    tabsFor(e)?.createTab(opts.url, opts.activate ?? true)
  )
  ipcMain.handle('tabs:close', (e, tabId: string) => tabsFor(e)?.closeTab(tabId))
  ipcMain.handle('tabs:activate', (e, tabId: string) => tabsFor(e)?.activateTab(tabId))
  ipcMain.handle('tabs:navigate', (e, p: { id: string; url: string }) =>
    tabsFor(e)?.navigate(p.id, p.url)
  )
  ipcMain.handle('tabs:goBack', (e, tabId: string) => tabsFor(e)?.goBack(tabId))
  ipcMain.handle('tabs:goForward', (e, tabId: string) => tabsFor(e)?.goForward(tabId))
  ipcMain.handle('tabs:reload', (e, tabId: string) => tabsFor(e)?.reload(tabId))
  ipcMain.handle('tabs:find', (e, p: { text: string; opts?: FindOptions }) =>
    tabsFor(e)?.find(p.text, p.opts)
  )
  ipcMain.handle('tabs:stopFind', (e) => tabsFor(e)?.stopFind())

  ipcMain.handle('downloads:list', (e) => downloadsFor(e)?.list() ?? [])
  ipcMain.handle('downloads:open', (e, id: string) => downloadsFor(e)?.open(id))
  ipcMain.handle('downloads:showInFolder', (e, id: string) => downloadsFor(e)?.showInFolder(id))
  ipcMain.handle('downloads:cancel', (e, id: string) => downloadsFor(e)?.cancel(id))
  ipcMain.handle('downloads:clear', (e) => downloadsFor(e)?.clear())

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => setSettings(patch))
  ipcMain.handle('settings:engines', () => SEARCH_ENGINES)
  ipcMain.handle('settings:clearData', async () => {
    const ses = browserSession()
    await ses.clearStorageData()
    await ses.clearCache()
    clearHistory()
  })
  ipcMain.handle('settings:isDefaultBrowser', () => app.isDefaultProtocolClient('http'))
  ipcMain.handle('settings:makeDefaultBrowser', () => {
    app.setAsDefaultProtocolClient('http')
    app.setAsDefaultProtocolClient('https')
    return app.isDefaultProtocolClient('http')
  })

  ipcMain.handle('history:query', (_e, text: string) => queryHistory(text))
  ipcMain.handle('history:clear', () => clearHistory())

  ipcMain.handle('bookmarks:list', () => bookmarks.list())
  ipcMain.handle('bookmarks:toggle', (_e, p: { url: string; title: string }) =>
    bookmarks.toggle(p.url, p.title)
  )
  ipcMain.handle('bookmarks:remove', (_e, url: string) => {
    bookmarks.remove(url)
    return bookmarks.list()
  })

  ipcMain.handle('overlay:set', (e, open: boolean) => tabsFor(e)?.setChromeOverlay(open))

  // ---- Assistant side panel --------------------------------------------
  ipcMain.handle('sidebar:set', (e, open: boolean) => tabsFor(e)?.setSidebar(open))
  ipcMain.handle('sidebar:active-tab', (e) => tabsFor(e)?.activeTabInfo() ?? null)
  ipcMain.handle('sidebar:exec', (e, code: string) => tabsFor(e)?.execInActive(code) ?? null)

  ipcMain.handle('sidebar:storage:get', (_e, keys: string[]) => {
    const store = readJSON<Record<string, unknown>>(SIDEBAR_STATE_FILE, {})
    const out: Record<string, unknown> = {}
    for (const key of keys) if (key in store) out[key] = store[key]
    return out
  })
  ipcMain.handle('sidebar:storage:set', (_e, patch: Record<string, unknown>) => {
    const store = readJSON<Record<string, unknown>>(SIDEBAR_STATE_FILE, {})
    writeJSON(SIDEBAR_STATE_FILE, { ...store, ...patch })
  })
}
