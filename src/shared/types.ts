// Types shared between the main process, the preload bridge, and the renderer.

/** A property-management profile. Each profile maps to an isolated, persistent
 *  Electron session partition so cookies/storage for one PM customer never leak
 *  into another. */
export interface Profile {
  id: string
  name: string
}

/** Serializable snapshot of a single embedded browser tab, pushed to the
 *  renderer whenever tab state changes. */
export interface TabState {
  id: string
  profileId: string
  title: string
  url: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

/** The whole shell state the sidebar/tabbar renders from. */
export interface ShellState {
  profiles: Profile[]
  tabs: TabState[]
  activeTabId: string | null
  activeProfileId: string
}

export interface CreateTabOptions {
  url: string
  profileId?: string
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
  profiles: {
    create(name: string): Promise<Profile>
    activate(profileId: string): Promise<void>
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
  /** Subscribe to shell-state changes. Returns an unsubscribe function. */
  onStateChanged(cb: (state: ShellState) => void): () => void
}
