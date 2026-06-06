import { app, ipcMain } from 'electron'
import type { TabManager } from './TabManager'
import type { DownloadManager } from './downloads'
import { getSettings, setSettings, SEARCH_ENGINES } from './settings'
import { query as queryHistory, clearHistory } from './history'
import * as bookmarks from './bookmarks'
import { browserSession } from './sessions'
import type { AppInfo, CreateTabOptions, FindOptions, Settings } from '../shared/types'

export function registerIpc(
  tabs: TabManager,
  downloads: DownloadManager,
  cdpPort: number | null
): void {
  ipcMain.handle('shell:getState', () => tabs.getState())

  ipcMain.handle('app:info', (): AppInfo => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    cdpPort
  }))

  ipcMain.handle('tabs:create', (_e, opts: CreateTabOptions) =>
    tabs.createTab(opts.url, opts.activate ?? true)
  )
  ipcMain.handle('tabs:close', (_e, tabId: string) => tabs.closeTab(tabId))
  ipcMain.handle('tabs:activate', (_e, tabId: string) => tabs.activateTab(tabId))
  ipcMain.handle('tabs:navigate', (_e, p: { id: string; url: string }) =>
    tabs.navigate(p.id, p.url)
  )
  ipcMain.handle('tabs:goBack', (_e, tabId: string) => tabs.goBack(tabId))
  ipcMain.handle('tabs:goForward', (_e, tabId: string) => tabs.goForward(tabId))
  ipcMain.handle('tabs:reload', (_e, tabId: string) => tabs.reload(tabId))
  ipcMain.handle('tabs:find', (_e, p: { text: string; opts?: FindOptions }) =>
    tabs.find(p.text, p.opts)
  )
  ipcMain.handle('tabs:stopFind', () => tabs.stopFind())

  ipcMain.handle('downloads:list', () => downloads.list())
  ipcMain.handle('downloads:open', (_e, id: string) => downloads.open(id))
  ipcMain.handle('downloads:showInFolder', (_e, id: string) => downloads.showInFolder(id))
  ipcMain.handle('downloads:cancel', (_e, id: string) => downloads.cancel(id))
  ipcMain.handle('downloads:clear', () => downloads.clear())

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => setSettings(patch))
  ipcMain.handle('settings:engines', () => SEARCH_ENGINES)
  ipcMain.handle('settings:clearData', async () => {
    const ses = browserSession()
    await ses.clearStorageData()
    await ses.clearCache()
    clearHistory()
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

  ipcMain.handle('settings:isDefaultBrowser', () => app.isDefaultProtocolClient('http'))
  ipcMain.handle('settings:makeDefaultBrowser', () => {
    app.setAsDefaultProtocolClient('http')
    app.setAsDefaultProtocolClient('https')
    return app.isDefaultProtocolClient('http')
  })

  ipcMain.handle('overlay:set', (_e, open: boolean) => tabs.setChromeOverlay(open))
}
