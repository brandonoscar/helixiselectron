import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { controllerForSender, focusedController } from './windows'
import { extractReadable } from './readable'
import { getSettings, setSettings, SEARCH_ENGINES } from './settings'
import { query as queryHistory, clearHistory } from './history'
import * as bookmarks from './bookmarks'
import { browserSession } from './sessions'
import { classifySenderUrl, type SenderKind } from './security'
import { copilotOrigin } from './copilot'
import type { AppInfo, CreateTabOptions, FindOptions, Settings } from '../shared/types'

/** Resolve the TabManager / DownloadManager for the window that sent the IPC. */
function tabsFor(e: IpcMainInvokeEvent) {
  return controllerForSender(e.sender)?.tabManager ?? null
}
function downloadsFor(e: IpcMainInvokeEvent) {
  return controllerForSender(e.sender)?.downloads ?? null
}

/**
 * Sender-guarded ipcMain.handle (2026-07 security audit). The copilot panel
 * hosts a REMOTE origin with the same preload as the chrome, so every
 * channel must declare who may call it: `['chrome']` for browser controls
 * and data-destructive actions, `['chrome', 'copilot']` only for the
 * channels the copilot's feature actually needs. Untrusted / unexpected
 * senders get null and a warning — never an execution.
 *
 * ALL registrations in this file must go through this wrapper; the vitest
 * tripwire (security.test.ts) fails on any bare `ipcMain.handle` here.
 */
function handle(
  channel: string,
  allowed: SenderKind[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any — each call
  // site keeps its own precise handler signature; the wrapper only forwards.
  handler: (e: IpcMainInvokeEvent, ...args: any[]) => unknown
): void {
  ipcMain.handle(channel, (e: IpcMainInvokeEvent, ...args: unknown[]) => {
    const kind = classifySenderUrl(e.sender.getURL(), {
      rendererUrl: process.env.ELECTRON_RENDERER_URL || null,
      copilotOrigin: copilotOrigin()
    })
    if (!allowed.includes(kind)) {
      console.warn(`ipc: blocked '${channel}' from ${kind} sender ${e.sender.getURL()}`)
      return null
    }
    return handler(e, ...args)
  })
}

const CHROME: SenderKind[] = ['chrome']
const CHROME_OR_COPILOT: SenderKind[] = ['chrome', 'copilot']

export function registerIpc(cdpPort: number | null): void {
  handle('shell:getState', CHROME, (e) => tabsFor(e)?.getState() ?? { tabs: [], activeTabId: null })

  handle('app:info', CHROME, (): AppInfo => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    cdpPort
  }))

  handle('tabs:create', CHROME, (e, opts: CreateTabOptions) =>
    tabsFor(e)?.createTab(opts.url, opts.activate ?? true)
  )
  handle('tabs:close', CHROME, (e, tabId: string) => tabsFor(e)?.closeTab(tabId))
  handle('tabs:activate', CHROME, (e, tabId: string) => tabsFor(e)?.activateTab(tabId))
  handle('tabs:navigate', CHROME, (e, p: { id: string; url: string }) =>
    tabsFor(e)?.navigate(p.id, p.url)
  )
  handle('tabs:goBack', CHROME, (e, tabId: string) => tabsFor(e)?.goBack(tabId))
  handle('tabs:goForward', CHROME, (e, tabId: string) => tabsFor(e)?.goForward(tabId))
  handle('tabs:reload', CHROME, (e, tabId: string) => tabsFor(e)?.reload(tabId))
  handle('tabs:find', CHROME, (e, p: { text: string; opts?: FindOptions }) =>
    tabsFor(e)?.find(p.text, p.opts)
  )
  handle('tabs:stopFind', CHROME, (e) => tabsFor(e)?.stopFind())

  handle('copilot:toggle', CHROME, (e) => controllerForSender(e.sender)?.toggleCopilot())

  // Clean main-text of the focused window's active tab (Mozilla Readability),
  // for the copilot's page context. Uses the focused window (the copilot panel
  // is a different WebContents than the chrome, so we don't match on sender).
  handle('page:context', CHROME_OR_COPILOT, () => {
    const wc = focusedController()?.tabManager.activeWebContents()
    return wc ? extractReadable(wc) : null
  })

  handle('downloads:list', CHROME, (e) => downloadsFor(e)?.list() ?? [])
  handle('downloads:open', CHROME, (e, id: string) => downloadsFor(e)?.open(id))
  handle('downloads:showInFolder', CHROME, (e, id: string) => downloadsFor(e)?.showInFolder(id))
  handle('downloads:cancel', CHROME, (e, id: string) => downloadsFor(e)?.cancel(id))
  handle('downloads:clear', CHROME, (e) => downloadsFor(e)?.clear())

  handle('settings:get', CHROME, () => getSettings())
  handle('settings:set', CHROME, (_e, patch: Partial<Settings>) => setSettings(patch))
  handle('settings:engines', CHROME, () => SEARCH_ENGINES)
  handle('settings:clearData', CHROME, async () => {
    const ses = browserSession()
    await ses.clearStorageData()
    await ses.clearCache()
    clearHistory()
  })
  handle('settings:isDefaultBrowser', CHROME, () => app.isDefaultProtocolClient('http'))
  handle('settings:makeDefaultBrowser', CHROME, () => {
    app.setAsDefaultProtocolClient('http')
    app.setAsDefaultProtocolClient('https')
    return app.isDefaultProtocolClient('http')
  })

  handle('history:query', CHROME, (_e, text: string) => queryHistory(text))
  handle('history:clear', CHROME, () => clearHistory())

  handle('bookmarks:list', CHROME, () => bookmarks.list())
  handle('bookmarks:toggle', CHROME, (_e, p: { url: string; title: string }) =>
    bookmarks.toggle(p.url, p.title)
  )
  handle('bookmarks:remove', CHROME, (_e, url: string) => {
    bookmarks.remove(url)
    return bookmarks.list()
  })

  handle('overlay:set', CHROME, (e, open: boolean) => tabsFor(e)?.setChromeOverlay(open))
}
