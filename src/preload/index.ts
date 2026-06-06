import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppInfo,
  CreateTabOptions,
  FindOptions,
  FindResult,
  HelixisApi,
  ShellState
} from '../shared/types'

const api: HelixisApi = {
  getState: () => ipcRenderer.invoke('shell:getState') as Promise<ShellState>,
  app: {
    info: () => ipcRenderer.invoke('app:info') as Promise<AppInfo>
  },
  tabs: {
    create: (opts: CreateTabOptions) =>
      ipcRenderer.invoke('tabs:create', opts) as Promise<string>,
    close: (tabId: string) =>
      ipcRenderer.invoke('tabs:close', tabId) as Promise<void>,
    activate: (tabId: string) =>
      ipcRenderer.invoke('tabs:activate', tabId) as Promise<void>,
    navigate: (tabId: string, url: string) =>
      ipcRenderer.invoke('tabs:navigate', { id: tabId, url }) as Promise<void>,
    goBack: (tabId: string) =>
      ipcRenderer.invoke('tabs:goBack', tabId) as Promise<void>,
    goForward: (tabId: string) =>
      ipcRenderer.invoke('tabs:goForward', tabId) as Promise<void>,
    reload: (tabId: string) =>
      ipcRenderer.invoke('tabs:reload', tabId) as Promise<void>,
    find: (text: string, opts?: FindOptions) =>
      ipcRenderer.invoke('tabs:find', { text, opts }) as Promise<void>,
    stopFind: () => ipcRenderer.invoke('tabs:stopFind') as Promise<void>
  },
  onStateChanged: (cb: (state: ShellState) => void) => {
    const listener = (_e: unknown, state: ShellState) => cb(state)
    ipcRenderer.on('shell:state', listener)
    return () => ipcRenderer.removeListener('shell:state', listener)
  },
  onFocusAddressBar: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('chrome:focus-address-bar', listener)
    return () => ipcRenderer.removeListener('chrome:focus-address-bar', listener)
  },
  onToggleFind: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('chrome:toggle-find', listener)
    return () => ipcRenderer.removeListener('chrome:toggle-find', listener)
  },
  onFindResult: (cb: (result: FindResult) => void) => {
    const listener = (_e: unknown, result: FindResult) => cb(result)
    ipcRenderer.on('shell:find-result', listener)
    return () => ipcRenderer.removeListener('shell:find-result', listener)
  }
}

contextBridge.exposeInMainWorld('helixis', api)
