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
  /** Favicon URL for the page, if the page advertised one. */
  favicon: string | null
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

export interface FindOptions {
  forward?: boolean
  findNext?: boolean
}

/** Result of an in-page find, pushed to the renderer's find bar. */
export interface FindResult {
  matches: number
  active: number
}

export type DownloadStatus =
  | 'progressing'
  | 'completed'
  | 'cancelled'
  | 'interrupted'

export interface DownloadItem {
  id: string
  filename: string
  url: string
  status: DownloadStatus
  received: number
  total: number
  savePath: string
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
    find(text: string, opts?: FindOptions): Promise<void>
    stopFind(): Promise<void>
  }
  downloads: {
    list(): Promise<DownloadItem[]>
    open(id: string): Promise<void>
    showInFolder(id: string): Promise<void>
    cancel(id: string): Promise<void>
    clear(): Promise<void>
  }
  /** Subscribe to browser-state changes. Returns an unsubscribe function. */
  onStateChanged(cb: (state: ShellState) => void): () => void
  /** Subscribe to the downloads list. Returns an unsubscribe function. */
  onDownloads(cb: (items: DownloadItem[]) => void): () => void
  /** Fired when the menu/shortcut asks to focus the address bar (Cmd/Ctrl+L). */
  onFocusAddressBar(cb: () => void): () => void
  /** Fired when the menu/shortcut toggles the find bar (Cmd/Ctrl+F). */
  onToggleFind(cb: () => void): () => void
  /** Fired with in-page find results for the active tab. */
  onFindResult(cb: (result: FindResult) => void): () => void
}
