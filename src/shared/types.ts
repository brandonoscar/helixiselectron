// Types shared between the main process, the preload bridge, and the renderer.

/** Serializable snapshot of a single browser tab, pushed to the renderer
 *  whenever tab state changes. */
export interface TabState {
  id: string
  title: string
  url: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

/** The whole browser state the chrome (tabs + toolbar) renders from. */
export interface ShellState {
  tabs: TabState[]
  activeTabId: string | null
}

export interface CreateTabOptions {
  url: string
  activate?: boolean
}

export interface AppInfo {
  version: string
  electron: string
  chrome: string
  node: string
  cdpPort: number | null
}

/** The API surface exposed on `window.helixis` by the preload bridge. */
export interface HelixisApi {
  getState(): Promise<ShellState>
  app: {
    info(): Promise<AppInfo>
  }
  tabs: {
    create(opts: CreateTabOptions): Promise<string>
    close(tabId: string): Promise<void>
    activate(tabId: string): Promise<void>
    navigate(tabId: string, url: string): Promise<void>
    goBack(tabId: string): Promise<void>
    goForward(tabId: string): Promise<void>
    reload(tabId: string): Promise<void>
  }
  /** Subscribe to browser-state changes. Returns an unsubscribe function. */
  onStateChanged(cb: (state: ShellState) => void): () => void
}
