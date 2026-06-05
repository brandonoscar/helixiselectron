import { app, ipcMain } from 'electron'
import type { TabManager } from './TabManager'
import type { AppInfo, CreateTabOptions } from '../shared/types'

export function registerIpc(tabs: TabManager, cdpPort: number | null): void {
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
}
