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

/** The hosted Occupella app's URL — same page the copilot docks, exported
 *  for the first-run tab (windows.ts): a fresh install lands on the app's
 *  sign-in / create-account screen before anything else. */
export function appUrl(): string {
  return copilotUrl()
}

/** True in the page when a Supabase session token is present. supabase-js
 *  stores it under `sb-<project-ref>-auth-token` in localStorage; both the
 *  main tab and this panel share the window's persistent session, so a
 *  sign-in in the main tab is visible from here. */
export const AUTH_CHECK_JS =
  "Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))"

/** The signed-out panel body. Shown INSTEAD of the app when no session
 *  exists yet — without this, a fresh install that toggled the copilot saw
 *  two side-by-side login forms (main tab + panel), which read as a glitch
 *  (founder feedback on the v0.1.0 build). Static markup only: no scripts,
 *  no external fetches, styled to match the dark chrome. */
export function placeholderHTML(shortcut: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{height:100%;margin:0;background:#0b0d11;color:#8b93a3;
    font:13px/1.6 system-ui,sans-serif;-webkit-user-select:none}
  .wrap{height:100%;display:flex;flex-direction:column;align-items:center;
    justify-content:center;gap:10px;padding:0 28px;text-align:center}
  .title{color:#e6e9ef;font-size:14px;font-weight:600}
  kbd{background:#1a1e26;border:1px solid #2a2f3a;border-radius:4px;
    padding:1px 6px;font-family:inherit;font-size:12px;color:#e6e9ef}
  </style></head><body><div class="wrap">
  <div class="title">Sign in to Occupella</div>
  <div>Use the main window to sign in or create your account.
  Then press <kbd>${shortcut}</kbd> to open the copilot.</div>
  </div></body></html>`
}

function placeholderDataUrl(): string {
  const shortcut = process.platform === 'darwin' ? '⌘E' : 'Ctrl+E'
  return `data:text/html;charset=utf-8,${encodeURIComponent(placeholderHTML(shortcut))}`
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
  private showingPlaceholder = false

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
    if (this.open && !this.view) {
      this.create()
    } else if (this.open && this.showingPlaceholder) {
      // A sign-in may have happened in the main tab since the signed-out
      // placeholder was shown — retry the app on every re-open.
      void this.loadApp()
    }
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
    void this.loadApp()
  }

  /** Load the hosted app; fall back to the signed-out placeholder when no
   *  Supabase session exists yet, so a fresh install never shows a second
   *  login form beside the main tab's. */
  private async loadApp(): Promise<void> {
    if (!this.view) return
    const wc = this.view.webContents
    this.showingPlaceholder = false
    try {
      await wc.loadURL(copilotUrl())
      // userGesture=false; the page is our own app — the check only picks
      // which of our own surfaces to show, never grants anything.
      const authed = (await wc.executeJavaScript(AUTH_CHECK_JS, false)) === true
      if (!authed) {
        this.showingPlaceholder = true
        await wc.loadURL(placeholderDataUrl())
      }
    } catch {
      // Network/abort — leave whatever rendered; the next toggle retries.
      this.showingPlaceholder = true
    }
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
