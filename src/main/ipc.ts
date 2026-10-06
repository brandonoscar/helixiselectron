import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { controllerForSender } from './windows'
import { getSettings, setSettings, SEARCH_ENGINES } from './settings'
import { query as queryHistory, clearHistory } from './history'
import * as bookmarks from './bookmarks'
import { browserSession } from './sessions'
import { classifySenderUrl } from './security'
import type { AppInfo, CreateTabOptions, FindOptions, Settings } from '../shared/types'

/** Resolve the TabManager / DownloadManager for the window that sent the IPC. */
function tabsFor(e: IpcMainInvokeEvent) {
  return controllerForSender(e.sender)?.tabManager ?? null
}
function downloadsFor(e: IpcMainInvokeEvent) {
  return controllerForSender(e.sender)?.downloads ?? null
}

/**
 * Sender-guarded ipcMain.handle (2026-07 security audit, tightened 2026-10).
 * Every channel here belongs to the browser chrome. A call is served only
 * when the sender is a chrome view this process created (by identity), the
 * call comes from its top-level frame, and that frame shows the chrome UI.
 * Anything else gets null and a warning, never an execution. The copilot
 * panel has its own channels in copilotIpc.ts.
 *
 * ALL registrations in this file must go through this wrapper; the vitest
 * tripwire (security.test.ts) walks this file's syntax tree and fails on any
 * other `ipcMain.handle` call.
 */
function handle(
  channel: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any — each call
  // site keeps its own precise handler signature; the wrapper only forwards.
  handler: (e: IpcMainInvokeEvent, ...args: any[]) => unknown
): void {
  ipcMain.handle(channel, (e: IpcMainInvokeEvent, ...args: unknown[]) => {
    const frame = e.senderFrame
    const kind =
      controllerForSender(e.sender) && frame && frame.parent === null
        ? classifySenderUrl(frame.url, { rendererUrl: process.env.ELECTRON_RENDERER_URL || null })
        : 'untrusted'
    if (kind !== 'chrome') {
      console.warn(`ipc: blocked '${channel}' from untrusted sender ${frame?.url ?? '(gone)'}`)
      return null
    }
    return handler(e, ...args)
  })
}

export function registerIpc(cdpPort: number | null): void {
  handle('shell:getState', (e) => tabsFor(e)?.getState() ?? { tabs: [], activeTabId: null })

  handle('app:info', (): AppInfo => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    cdpPort
  }))

  handle('tabs:create', (e, opts: CreateTabOptions) =>
    tabsFor(e)?.createTab(opts.url, opts.activate ?? true)
  )
  handle('tabs:close', (e, tabId: string) => tabsFor(e)?.closeTab(tabId))
  handle('tabs:activate', (e, tabId: string) => tabsFor(e)?.activateTab(tabId))
  handle('tabs:navigate', (e, p: { id: string; url: string }) =>
    tabsFor(e)?.navigate(p.id, p.url)
  )
  handle('tabs:goBack', (e, tabId: string) => tabsFor(e)?.goBack(tabId))
  handle('tabs:goForward', (e, tabId: string) => tabsFor(e)?.goForward(tabId))
  handle('tabs:reload', (e, tabId: string) => tabsFor(e)?.reload(tabId))
  handle('tabs:find', (e, p: { text: string; opts?: FindOptions }) =>
    tabsFor(e)?.find(p.text, p.opts)
  )
  handle('tabs:stopFind', (e) => tabsFor(e)?.stopFind())

  handle('copilot:toggle', (e) => controllerForSender(e.sender)?.toggleCopilot())

  handle('downloads:list', (e) => downloadsFor(e)?.list() ?? [])
  handle('downloads:open', (e, id: string) => downloadsFor(e)?.open(id))
  handle('downloads:showInFolder', (e, id: string) => downloadsFor(e)?.showInFolder(id))
  handle('downloads:cancel', (e, id: string) => downloadsFor(e)?.cancel(id))
  handle('downloads:clear', (e) => downloadsFor(e)?.clear())

  handle('settings:get', () => getSettings())
  handle('settings:set', (_e, patch: Partial<Settings>) => setSettings(patch))
  handle('settings:engines', () => SEARCH_ENGINES)
  handle('settings:clearData', async () => {
    const ses = browserSession()
    await ses.clearStorageData()
    await ses.clearCache()
    clearHistory()
  })
  handle('settings:isDefaultBrowser', () => app.isDefaultProtocolClient('http'))
  handle('settings:makeDefaultBrowser', () => {
    app.setAsDefaultProtocolClient('http')
    app.setAsDefaultProtocolClient('https')
    return app.isDefaultProtocolClient('http')
  })

  handle('history:query', (_e, text: string) => queryHistory(text))
  handle('history:clear', () => clearHistory())

  handle('bookmarks:list', () => bookmarks.list())
  handle('bookmarks:toggle', (_e, p: { url: string; title: string }) =>
    bookmarks.toggle(p.url, p.title)
  )
  handle('bookmarks:remove', (_e, url: string) => {
    bookmarks.remove(url)
    return bookmarks.list()
  })

  handle('overlay:set', (e, open: boolean) => tabsFor(e)?.setChromeOverlay(open))
}
