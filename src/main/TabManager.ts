import { BaseWindow, WebContentsView, shell } from 'electron'
import type { ShellState, TabState } from '../shared/types'
import {
  SIDEBAR_WIDTH,
  TABBAR_HEIGHT,
  DEFAULT_PROFILE_ID
} from '../shared/layout'
import {
  createProfile,
  ensureDefaultProfile,
  listProfiles,
  sessionFor
} from './sessions'

interface Tab {
  id: string
  profileId: string
  view: WebContentsView
}

/**
 * Owns the BaseWindow, the chrome (React UI) view, and one WebContentsView per
 * embedded tab. The chrome view spans the whole window; each content view is
 * layered on top, occupying the region to the right of the sidebar and below the
 * tab bar. Only the active tab's view is visible.
 *
 * This is the architecture the deprecated BrowserView pattern was replaced by in
 * Electron 30+ (BaseWindow + WebContentsView).
 */
export class TabManager {
  private window: BaseWindow
  private chrome: WebContentsView
  private tabs = new Map<string, Tab>()
  private order: string[] = []
  private activeTabId: string | null = null
  private activeProfileId = DEFAULT_PROFILE_ID

  constructor(window: BaseWindow, chrome: WebContentsView) {
    this.window = window
    this.chrome = chrome
    ensureDefaultProfile()

    this.window.on('resize', () => this.layout())
    // BaseWindow does not emit 'maximize'/'unmaximize' bounds reliably on every
    // platform until the next resize tick; relayout defensively on focus too.
    this.window.on('focus', () => this.layout())
  }

  // ---- layout -----------------------------------------------------------

  private contentBounds() {
    const [width, height] = this.window.getContentSize()
    return {
      x: SIDEBAR_WIDTH,
      y: TABBAR_HEIGHT,
      width: Math.max(0, width - SIDEBAR_WIDTH),
      height: Math.max(0, height - TABBAR_HEIGHT)
    }
  }

  /** Reposition the chrome view (full window) and the active content view. */
  layout(): void {
    const [width, height] = this.window.getContentSize()
    this.chrome.setBounds({ x: 0, y: 0, width, height })
    const bounds = this.contentBounds()
    for (const tab of this.tabs.values()) {
      const isActive = tab.id === this.activeTabId
      tab.view.setVisible(isActive)
      if (isActive) tab.view.setBounds(bounds)
    }
  }

  // ---- tabs -------------------------------------------------------------

  createTab(url: string, profileId = this.activeProfileId, activate = true): string {
    const id = `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const view = new WebContentsView({
      webPreferences: {
        session: sessionFor(profileId),
        // Embedded content is untrusted third-party web pages: keep it sandboxed
        // with no Node integration and context isolation on.
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    const tab: Tab = { id, profileId, view }
    this.tabs.set(id, tab)
    this.order.push(id)
    this.window.contentView.addChildView(view)

    this.wireTab(tab)
    view.webContents.loadURL(url).catch(() => {
      /* surfaced to the renderer via did-fail-load */
    })

    if (activate) this.activateTab(id)
    else view.setVisible(false)

    this.layout()
    this.emitState()
    return id
  }

  private wireTab(tab: Tab): void {
    const wc = tab.view.webContents
    const update = () => this.emitState()

    wc.on('page-title-updated', update)
    wc.on('did-navigate', update)
    wc.on('did-navigate-in-page', update)
    wc.on('did-start-loading', update)
    wc.on('did-stop-loading', update)
    wc.on('did-finish-load', update)
    wc.on('did-fail-load', update)

    // Open target=_blank / window.open as new tabs in the same profile rather
    // than spawning detached popups. OAuth that demands a real top-level browser
    // (e.g. Google, which blocks embedded webviews) is pushed to the system
    // browser instead — see the report's Risk 2 de-risking note.
    wc.setWindowOpenHandler(({ url }) => {
      if (requiresSystemBrowser(url)) {
        shell.openExternal(url).catch(() => {})
        return { action: 'deny' }
      }
      this.createTab(url, tab.profileId, true)
      return { action: 'deny' }
    })
  }

  activateTab(tabId: string): void {
    if (!this.tabs.has(tabId)) return
    this.activeTabId = tabId
    const tab = this.tabs.get(tabId)!
    this.activeProfileId = tab.profileId
    // Bring the active view to the top of the z-order, above the chrome.
    this.window.contentView.addChildView(tab.view)
    this.layout()
    this.emitState()
  }

  closeTab(tabId: string): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return
    this.window.contentView.removeChildView(tab.view)
    tab.view.webContents.close()
    this.tabs.delete(tabId)
    this.order = this.order.filter((id) => id !== tabId)

    if (this.activeTabId === tabId) {
      this.activeTabId = this.order[this.order.length - 1] ?? null
      if (this.activeTabId) this.activateTab(this.activeTabId)
    }
    this.layout()
    this.emitState()
  }

  navigate(tabId: string, url: string): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return
    tab.view.webContents.loadURL(normalizeUrl(url)).catch(() => {})
  }

  goBack(tabId: string): void {
    this.tabs.get(tabId)?.view.webContents.navigationHistory.goBack()
  }

  goForward(tabId: string): void {
    this.tabs.get(tabId)?.view.webContents.navigationHistory.goForward()
  }

  reload(tabId: string): void {
    this.tabs.get(tabId)?.view.webContents.reload()
  }

  // ---- profiles ---------------------------------------------------------

  createProfile(name: string) {
    const profile = createProfile(name)
    this.emitState()
    return profile
  }

  activateProfile(profileId: string): void {
    this.activeProfileId = profileId
    this.emitState()
  }

  // ---- state broadcast --------------------------------------------------

  getState(): ShellState {
    const tabs: TabState[] = this.order
      .map((id) => this.tabs.get(id))
      .filter((t): t is Tab => Boolean(t))
      .map((t) => {
        const wc = t.view.webContents
        return {
          id: t.id,
          profileId: t.profileId,
          title: wc.getTitle() || 'New tab',
          url: wc.getURL(),
          isLoading: wc.isLoading(),
          canGoBack: wc.navigationHistory.canGoBack(),
          canGoForward: wc.navigationHistory.canGoForward()
        }
      })

    return {
      profiles: listProfiles(),
      tabs,
      activeTabId: this.activeTabId,
      activeProfileId: this.activeProfileId
    }
  }

  private emitState(): void {
    if (this.chrome.webContents.isDestroyed()) return
    this.chrome.webContents.send('shell:state', this.getState())
  }
}

/** OAuth providers that detect and block embedded webviews must use the system
 *  browser. Google is the documented case (blocked since Sept 2021). */
function requiresSystemBrowser(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return host === 'accounts.google.com' || host.endsWith('.accounts.google.com')
  } catch {
    return false
  }
}

/** Accept bare hostnames/searches from the URL bar and turn them into URLs. */
function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  if (/^[a-z]+:\/\//i.test(trimmed) || trimmed.startsWith('about:')) return trimmed
  if (/^[^\s.]+\.[^\s]+/.test(trimmed)) return `https://${trimmed}`
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`
}
