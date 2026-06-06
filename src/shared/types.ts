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

export interface Settings {
  /** Search-engine id. */
  searchEngine: string
  /** Startup page: a URL, or the new-tab URL for the Helixis new-tab page. */
  homePage: string
  /** Reopen last session's tabs on launch. */
  restoreSession: boolean
}

export interface SearchEngine {
  id: string
  name: string
  url: string
}

/** An address-bar autocomplete suggestion from history. */
export interface Suggestion {
  url: string
  title: string
}

export interface Bookmark {
  url: string
  title: string
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
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
    engines(): Promise<SearchEngine[]>
    clearData(): Promise<void>
    isDefaultBrowser(): Promise<boolean>
    makeDefaultBrowser(): Promise<boolean>
  }
  history: {
    query(text: string): Promise<Suggestion[]>
    clear(): Promise<void>
  }
  bookmarks: {
    list(): Promise<Bookmark[]>
    toggle(url: string, title: string): Promise<Bookmark[]>
    remove(url: string): Promise<Bookmark[]>
  }
  /** Subscribe to bookmark-list changes. Returns an unsubscribe function. */
  onBookmarks(cb: (items: Bookmark[]) => void): () => void
  /** Raise the chrome view above the page for a full-area overlay (settings,
   *  autocomplete), and restore the page on close. */
  setOverlay(open: boolean): Promise<void>
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
