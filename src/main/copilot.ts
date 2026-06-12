import { WebContentsView, shell, type BaseWindow, type Session } from 'electron'
import { CHROME_HEIGHT, COPILOT_WIDTH } from '../shared/layout'

/** The chat surface the copilot panel hosts — the deployed AgenticHelixis
 *  frontend. Override with HELIXIS_COPILOT_URL (e.g. http://localhost:5173
 *  when developing the chat app locally). */
const DEFAULT_COPILOT_URL = 'https://agentichelixis.vercel.app'
function copilotUrl(): string {
  return process.env.HELIXIS_COPILOT_URL || DEFAULT_COPILOT_URL
}

/**
 * The Helixis Copilot side panel: a WebContentsView docked to the right
 * edge, below the chrome, hosting the AgenticHelixis chat surface (the
 * deployed web app — the same /agent/run SSE client as the browser
 * extension panel, with no second chat implementation to maintain).
 *
 * Lazy: the view (and its renderer process) is only created on first
 * toggle. Uses the window's persistent session so the Supabase login
 * survives restarts alongside site logins.
 *
 * Layout contract: when open, the owner gives TabManager a right inset
 * of COPILOT_WIDTH so page content and panel never overlap.
 */
export class CopilotPanel {
  private window: BaseWindow
  private session: Session
  private view: WebContentsView | null = null
  private open = false

  constructor(window: BaseWindow, session: Session) {
    this.window = window
    this.session = session
    this.window.on('resize', () => this.layout())
  }

  isOpen(): boolean {
    return this.open
  }

  toggle(): boolean {
    this.open = !this.open
    if (this.open && !this.view) this.create()
    if (this.view) this.view.setVisible(this.open)
    this.layout()
    return this.open
  }

  private create(): void {
    this.view = new WebContentsView({
      webPreferences: {
        session: this.session,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    // Keep the panel single-page: external links / OAuth popups go to the
    // system browser rather than spawning windows inside the panel.
    this.view.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url)
      return { action: 'deny' }
    })
    this.window.contentView.addChildView(this.view)
    void this.view.webContents.loadURL(copilotUrl())
  }

  layout(): void {
    if (!this.view || !this.open) return
    const [width, height] = this.window.getContentSize()
    this.view.setBounds({
      x: Math.max(0, width - COPILOT_WIDTH),
      y: CHROME_HEIGHT,
      width: Math.min(COPILOT_WIDTH, width),
      height: Math.max(0, height - CHROME_HEIGHT)
    })
  }

  destroy(): void {
    if (this.view) {
      this.window.contentView.removeChildView(this.view)
      this.view.webContents.close()
      this.view = null
    }
    this.open = false
  }
}
