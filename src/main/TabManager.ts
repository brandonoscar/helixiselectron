import {
  BaseWindow,
  WebContentsView,
  shell,
  clipboard,
  Menu,
  type ContextMenuParams,
  type WebContents
} from 'electron'
import type { FindOptions, ShellState, TabState } from '../shared/types'
import { CHROME_HEIGHT, SEARCH_URL, HOME_URL, HELIXIS_SCHEME } from '../shared/layout'
import { browserSession } from './sessions'

interface Tab {
  id: string
  view: WebContentsView
  favicon: string | null
}

const ERROR_PREFIX = `${HELIXIS_SCHEME}://error`

/**
 * Owns the BaseWindow, the chrome (React tabs + toolbar) view, and one
 * WebContentsView per tab. The chrome view spans the whole window; each content
 * view is layered on top, occupying the region below the chrome. Only the active
 * tab's view is visible.
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
  /** URLs of recently closed tabs, for Reopen Closed Tab. */
  private closedStack: string[] = []
  /** Called (debounced by the owner) whenever the open-tab set changes, so the
   *  session can be persisted for restore on next launch. */
  private persistHandler: (() => void) | null = null

  constructor(window: BaseWindow, chrome: WebContentsView) {
    this.window = window
    this.chrome = chrome
    this.window.on('resize', () => this.layout())
    this.window.on('focus', () => this.layout())
  }

  // ---- layout -----------------------------------------------------------

  private contentBounds() {
    const [width, height] = this.window.getContentSize()
    return {
      x: 0,
      y: CHROME_HEIGHT,
      width,
      height: Math.max(0, height - CHROME_HEIGHT)
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

  createTab(url: string, activate = true): string {
    const id = `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const view = new WebContentsView({
      webPreferences: {
        session: browserSession(),
        // Web pages are untrusted: sandbox, context isolation on, no Node.
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    const tab: Tab = { id, view, favicon: null }
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
    wc.on('did-navigate', () => {
      // Clear the favicon on a top-level navigation until the new page reports
      // one, so a stale icon doesn't linger.
      tab.favicon = null
      update()
    })
    wc.on('did-navigate-in-page', update)
    wc.on('did-start-loading', update)
    wc.on('did-stop-loading', update)
    wc.on('did-finish-load', update)
    wc.on('page-favicon-updated', (_e, favicons) => {
      tab.favicon = favicons[0] ?? null
      update()
    })
    wc.on('did-fail-load', (_e, code, desc, failedUrl, isMainFrame) => {
      // -3 is ERR_ABORTED (e.g. a navigation superseded by another) — ignore.
      // Only main-frame failures get an error page; never recurse on our own
      // error/new-tab pages.
      if (!isMainFrame || code === -3) return
      if (failedUrl.startsWith(`${HELIXIS_SCHEME}://`)) return
      const target = `${ERROR_PREFIX}?u=${encodeURIComponent(failedUrl)}&code=${code}&msg=${encodeURIComponent(desc)}`
      wc.loadURL(target).catch(() => {})
    })

    wc.on('found-in-page', (_e, result) => {
      if (this.chrome.webContents.isDestroyed()) return
      this.chrome.webContents.send('shell:find-result', {
        matches: result.matches,
        active: result.activeMatchOrdinal
      })
    })

    wc.on('context-menu', (_e, params) => this.showContextMenu(wc, params))

    // Open target=_blank / window.open as new tabs. OAuth that demands a real
    // top-level browser (e.g. Google, which blocks embedded webviews) is pushed
    // to the system browser instead.
    wc.setWindowOpenHandler(({ url }) => {
      if (requiresSystemBrowser(url)) {
        shell.openExternal(url).catch(() => {})
        return { action: 'deny' }
      }
      this.createTab(url, true)
      return { action: 'deny' }
    })
  }

  private showContextMenu(wc: WebContents, params: ContextMenuParams): void {
    const items: Electron.MenuItemConstructorOptions[] = []

    if (params.linkURL) {
      items.push(
        { label: 'Open Link in New Tab', click: () => this.createTab(params.linkURL, false) },
        { label: 'Copy Link Address', click: () => clipboard.writeText(params.linkURL) },
        { type: 'separator' }
      )
    }

    if (params.mediaType === 'image' && params.srcURL) {
      items.push(
        { label: 'Open Image in New Tab', click: () => this.createTab(params.srcURL, false) },
        { label: 'Copy Image', click: () => wc.copyImageAt(params.x, params.y) },
        { label: 'Copy Image Address', click: () => clipboard.writeText(params.srcURL) },
        { label: 'Save Image…', click: () => wc.downloadURL(params.srcURL) },
        { type: 'separator' }
      )
    }

    if (params.isEditable) {
      items.push(
        { role: 'cut', enabled: params.editFlags.canCut },
        { role: 'copy', enabled: params.editFlags.canCopy },
        { role: 'paste', enabled: params.editFlags.canPaste },
        { role: 'selectAll' },
        { type: 'separator' }
      )
    } else if (params.selectionText) {
      items.push(
        { role: 'copy' },
        {
          label: `Search for “${truncate(params.selectionText, 24)}”`,
          click: () =>
            this.createTab(`${SEARCH_URL}?q=${encodeURIComponent(params.selectionText)}`, false)
        },
        { type: 'separator' }
      )
    }

    items.push(
      { label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
      { label: 'Forward', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
      { label: 'Reload', click: () => wc.reload() },
      { type: 'separator' },
      { label: 'Inspect Element', click: () => wc.inspectElement(params.x, params.y) }
    )

    Menu.buildFromTemplate(items).popup({ window: this.window })
  }

  activateTab(tabId: string): void {
    if (!this.tabs.has(tabId)) return
    this.activeTabId = tabId
    const tab = this.tabs.get(tabId)!
    // Bring the active view to the top of the z-order, above the chrome.
    this.window.contentView.addChildView(tab.view)
    this.layout()
    this.emitState()
  }

  closeTab(tabId: string): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return
    const url = tab.view.webContents.getURL()
    if (url && !url.startsWith(`${HELIXIS_SCHEME}://`)) this.closedStack.push(url)
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
    const wc = this.tabs.get(tabId)?.view.webContents
    if (!wc) return
    const original = errorOriginal(wc.getURL())
    if (original) wc.loadURL(original).catch(() => {})
    else wc.reload()
  }

  find(text: string, opts: FindOptions = {}): void {
    const wc = this.activeWc()
    if (!wc) return
    if (!text) {
      wc.stopFindInPage('clearSelection')
      return
    }
    wc.findInPage(text, { forward: opts.forward ?? true, findNext: opts.findNext ?? false })
  }

  stopFind(): void {
    this.activeWc()?.stopFindInPage('clearSelection')
  }

  // ---- active-tab actions (driven by the app menu / shortcuts) -----------

  private activeWc(): WebContents | null {
    if (!this.activeTabId) return null
    return this.tabs.get(this.activeTabId)?.view.webContents ?? null
  }

  newTab(): void {
    this.createTab(HOME_URL)
  }

  closeActive(): void {
    if (this.activeTabId) this.closeTab(this.activeTabId)
  }

  reopenClosedTab(): void {
    const url = this.closedStack.pop()
    if (url) this.createTab(url)
  }

  reloadActive(ignoreCache: boolean): void {
    const wc = this.activeWc()
    if (!wc) return
    const original = errorOriginal(wc.getURL())
    if (original) wc.loadURL(original).catch(() => {})
    else if (ignoreCache) wc.reloadIgnoringCache()
    else wc.reload()
  }

  backActive(): void {
    this.activeWc()?.navigationHistory.goBack()
  }

  forwardActive(): void {
    this.activeWc()?.navigationHistory.goForward()
  }

  zoomIn(): void {
    const wc = this.activeWc()
    if (wc) wc.setZoomLevel(Math.min(wc.getZoomLevel() + 0.5, 5))
  }

  zoomOut(): void {
    const wc = this.activeWc()
    if (wc) wc.setZoomLevel(Math.max(wc.getZoomLevel() - 0.5, -5))
  }

  zoomReset(): void {
    this.activeWc()?.setZoomLevel(0)
  }

  toggleDevTools(): void {
    const wc = this.activeWc()
    if (!wc) return
    if (wc.isDevToolsOpened()) wc.closeDevTools()
    else wc.openDevTools({ mode: 'detach' })
  }

  selectNextTab(): void {
    this.cycleTab(1)
  }

  selectPrevTab(): void {
    this.cycleTab(-1)
  }

  private cycleTab(delta: number): void {
    if (this.order.length < 2 || !this.activeTabId) return
    const i = this.order.indexOf(this.activeTabId)
    const next = (i + delta + this.order.length) % this.order.length
    this.activateTab(this.order[next])
  }

  focusAddressBar(): void {
    if (!this.chrome.webContents.isDestroyed())
      this.chrome.webContents.send('chrome:focus-address-bar')
  }

  toggleFind(): void {
    if (!this.chrome.webContents.isDestroyed())
      this.chrome.webContents.send('chrome:toggle-find')
  }

  // ---- state broadcast --------------------------------------------------

  getState(): ShellState {
    const tabs: TabState[] = this.order
      .map((id) => this.tabs.get(id))
      .filter((t): t is Tab => Boolean(t))
      .map((t) => {
        const wc = t.view.webContents
        const rawUrl = wc.getURL()
        // On the error page, show the original failed URL in the address bar.
        const displayUrl = errorOriginal(rawUrl) ?? rawUrl
        return {
          id: t.id,
          title: wc.getTitle() || 'New tab',
          url: displayUrl,
          isLoading: wc.isLoading(),
          canGoBack: wc.navigationHistory.canGoBack(),
          canGoForward: wc.navigationHistory.canGoForward(),
          favicon: t.favicon
        }
      })

    return { tabs, activeTabId: this.activeTabId }
  }

  private emitState(): void {
    if (!this.chrome.webContents.isDestroyed())
      this.chrome.webContents.send('shell:state', this.getState())
    this.persistHandler?.()
  }

  setPersistHandler(fn: () => void): void {
    this.persistHandler = fn
  }

  /** Snapshot of open tabs for session restore: the real (non-error) URLs and
   *  the index of the active tab. */
  serialize(): { tabs: string[]; active: number } {
    const urls: string[] = []
    let active = 0
    this.order.forEach((id) => {
      const tab = this.tabs.get(id)
      if (!tab) return
      const raw = tab.view.webContents.getURL()
      const url = errorOriginal(raw) ?? raw
      if (!url) return
      if (id === this.activeTabId) active = urls.length
      urls.push(url)
    })
    return { tabs: urls, active }
  }

  /** Restore tabs from a serialized session. Returns true if anything opened. */
  restore(session: { tabs: string[]; active: number }): boolean {
    if (!session.tabs.length) return false
    session.tabs.forEach((url) => this.createTab(url, false))
    const target = this.order[session.active] ?? this.order[0]
    if (target) this.activateTab(target)
    return true
  }
}

/** If the URL is our error page, return the original URL it was shown for. */
function errorOriginal(url: string): string | null {
  if (!url.startsWith(ERROR_PREFIX)) return null
  try {
    return new URL(url).searchParams.get('u')
  } catch {
    return null
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
  return `${SEARCH_URL}?q=${encodeURIComponent(trimmed)}`
}

function truncate(s: string, n: number): string {
  const clean = s.trim().replace(/\s+/g, ' ')
  return clean.length > n ? `${clean.slice(0, n)}…` : clean
}
