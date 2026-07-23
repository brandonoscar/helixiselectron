import { join } from 'node:path'
import { WebContentsView, shell, type BaseWindow, type Session } from 'electron'
import { CHROME_HEIGHT, COPILOT_WIDTH } from '../shared/layout'
import { isSafeExternalUrl } from './security'

/** The chat surface the copilot panel hosts — the deployed AgenticHelixis
 *  frontend. Override with HELIXIS_COPILOT_URL (e.g. http://localhost:5173
 *  when developing the chat app locally). */
const DEFAULT_COPILOT_URL = 'https://agentichelixis.vercel.app'
function copilotUrl(): string {
  return process.env.HELIXIS_COPILOT_URL || DEFAULT_COPILOT_URL
}

/** The copilot's origin — the ONE remote origin the IPC sender guard grants
 *  page-context access to (see ipc.ts). Falls back to the default origin if
 *  the override is malformed, so a typo'd env var can't widen the guard. */
export function copilotOrigin(): string {
  try {
    return new URL(copilotUrl()).origin
  } catch {
    return new URL(DEFAULT_COPILOT_URL).origin
  }
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
        // Same preload as the chrome, so the hosted web app can pull the
        // active tab's page context (window.helixis.page.context()).
        preload: join(__dirname, '../preload/index.js'),
        session: this.session,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    // Keep the panel single-page: external links / OAuth popups go to the
    // system browser rather than spawning windows inside the panel.
    // Scheme-validated (2026-07 audit): the panel hosts a REMOTE page, so a
    // compromised/injected page could window.open any URI — only http(s)/
    // mailto ever reach the OS; everything else is dropped.
    this.view.webContents.setWindowOpenHandler(({ url }) => {
      if (isSafeExternalUrl(url)) void shell.openExternal(url)
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
