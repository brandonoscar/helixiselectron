import { join } from 'node:path'
import { WebContentsView, app, session, shell, type BaseWindow, type Session, type WebContents } from 'electron'
import { CHROME_HEIGHT, COPILOT_WIDTH } from '../shared/layout'
import { isSafeExternalUrl } from './security'
import { APP_SCHEME, isAppUrl, registerAppProtocol } from './appProtocol'
import { CopilotNet } from './copilotNet'
import { ApprovalAlerts } from './approvals'

export const COPILOT_HOST = 'copilot'
export const COPILOT_URL = `${APP_SCHEME}://${COPILOT_HOST}/panel.html`

/** The copilot's own storage partition. Its Supabase session lives here, in
 *  the panel's localStorage, apart from every website the browser loads. It
 *  is shared by all windows (private ones too): signing in is about the
 *  user's Occupella account, not about browsing history. */
export const COPILOT_PARTITION = 'persist:occupella'

// The panel's scripts, styles and markup all come from app://copilot itself;
// it makes no network requests of its own (copilotNet.ts does them).
const COPILOT_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'"
].join('; ')

/** Where the bundled panel lives: resources/copilot, copied from the
 *  helixis-sidebar extension by scripts/sync-copilot.mjs. */
function copilotRoot(): string {
  return join(app.getAppPath(), 'resources', 'copilot')
}

let copilotSes: Session | null = null

export function copilotSession(): Session {
  if (!copilotSes) {
    copilotSes = session.fromPartition(COPILOT_PARTITION)
    registerAppProtocol(copilotSes, { [COPILOT_HOST]: { root: copilotRoot(), csp: COPILOT_CSP } })
  }
  return copilotSes
}

// Keyed by webContents id: the id is stable for the view's lifetime, which
// object identity of the JS wrapper is not documented to be.
const panels = new Map<number, CopilotPanel>()

/**
 * The Occupella Copilot side panel: the helixis-sidebar Chrome extension's
 * panel, bundled into the browser and docked to the right edge below the
 * chrome (Cmd/Ctrl+E). Lazy: the view and its renderer process are only
 * created on first open.
 *
 * Layout contract: while open, the owner gives TabManager a right inset of
 * COPILOT_WIDTH so page content and panel never overlap.
 */
export class CopilotPanel {
  private view: WebContentsView | null = null
  private open = false
  readonly net = new CopilotNet(copilotSession())
  readonly alerts: ApprovalAlerts

  constructor(
    private window: BaseWindow,
    /** Owner hook: reveal() asks the window to open the panel and focus. */
    reveal: () => void
  ) {
    this.alerts = ApprovalAlerts.create(window, reveal, () => this.isVisible())
    this.window.on('resize', () => this.layout())
    this.window.on('closed', () => this.destroy())
  }

  /** The panel that owns this WebContents, if it is a copilot panel. */
  static fromWebContents(wc: WebContents): CopilotPanel | null {
    return panels.get(wc.id) ?? null
  }

  isOpen(): boolean {
    return this.open
  }

  private isVisible(): boolean {
    return this.open && !this.window.isMinimized()
  }

  toggle(): boolean {
    return this.setOpen(!this.open)
  }

  setOpen(open: boolean): boolean {
    this.open = open
    if (this.open && !this.view) this.create()
    if (this.view) this.view.setVisible(this.open)
    this.layout()
    if (this.open) this.view?.webContents.focus()
    return this.open
  }

  private create(): void {
    const view = new WebContentsView({
      webPreferences: {
        // A narrow bridge for this page only (src/preload/copilot.ts), not
        // the browser chrome's window.helixis.
        preload: join(__dirname, '../preload/copilot.js'),
        session: copilotSession(),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    const wc = view.webContents
    const wcId = wc.id
    panels.set(wcId, this)

    // The panel is a single bundled page. It never navigates anywhere else,
    // so a stray link or an injected redirect cannot turn it into a remote
    // page that inherits the bridge.
    wc.on('will-navigate', (e, url) => {
      if (!isAppUrl(url, COPILOT_HOST)) e.preventDefault()
    })
    // External links go to the system browser, scheme-checked (http(s) and
    // mailto only); nothing opens a window inside the panel.
    wc.setWindowOpenHandler(({ url }) => {
      if (isSafeExternalUrl(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    wc.on('destroyed', () => {
      panels.delete(wcId)
      this.net.abortAll()
    })

    this.window.contentView.addChildView(view)
    this.view = view
    void wc.loadURL(COPILOT_URL)
  }

  layout(): void {
    if (!this.view || !this.open || this.window.isDestroyed()) return
    const [width, height] = this.window.getContentSize()
    this.view.setBounds({
      x: Math.max(0, width - COPILOT_WIDTH),
      y: CHROME_HEIGHT,
      width: Math.min(COPILOT_WIDTH, width),
      height: Math.max(0, height - CHROME_HEIGHT)
    })
  }

  destroy(): void {
    this.alerts.dispose()
    if (this.view) {
      const wc = this.view.webContents
      panels.delete(wc.id)
      this.net.abortAll()
      if (!this.window.isDestroyed()) this.window.contentView.removeChildView(this.view)
      if (!wc.isDestroyed()) wc.close()
      this.view = null
    }
    this.open = false
  }
}
