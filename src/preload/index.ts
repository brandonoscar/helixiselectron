import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppInfo,
  CreateTabOptions,
  HelixisApi,
  Profile,
  ShellState
} from '../shared/types'

const api: HelixisApi = {
  getState: () => ipcRenderer.invoke('shell:getState') as Promise<ShellState>,
  app: {
    info: () => ipcRenderer.invoke('app:info') as Promise<AppInfo>
  },
  profiles: {
    create: (name: string) =>
      ipcRenderer.invoke('profiles:create', name) as Promise<Profile>,
    activate: (profileId: string) =>
      ipcRenderer.invoke('profiles:activate', profileId) as Promise<void>
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
      ipcRenderer.invoke('tabs:reload', tabId) as Promise<void>
  },
  onStateChanged: (cb: (state: ShellState) => void) => {
    const listener = (_e: unknown, state: ShellState) => cb(state)
    ipcRenderer.on('shell:state', listener)
    return () => ipcRenderer.removeListener('shell:state', listener)
  }
}

contextBridge.exposeInMainWorld('helixis', api)
