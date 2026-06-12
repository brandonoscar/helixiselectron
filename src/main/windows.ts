import { join } from 'node:path'
import { BaseWindow, WebContentsView, type Session, type WebContents } from 'electron'
import { TabManager } from './TabManager'
import { CopilotPanel } from './copilot'
import { COPILOT_WIDTH } from '../shared/layout'
import { DownloadManager } from './downloads'
import { installPermissionHandlers } from './permissions'
import { registerHelixisProtocol } from './helixisProtocol'
import { browserSession, privateSession } from './sessions'
import { readJSON, writeJSON, debounce } from './store'
import { getSettings, homeUrl } from './settings'
import { NEWTAB_URL } from '../shared/layout'

const WINDOW_STATE_FILE = 'window-state.json'
const SESSION_FILE = 'session.json'

interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  maximized?: boolean
}

interface SessionState {
  tabs: string[]
  active: number
}

const controllers = new Set<WindowController>()
const permissionInstalled = new WeakSet<Session>()

export interface WindowOptions {
  incognito?: boolean
  /** Restore the saved session / open the home page (the first window). */
  restore?: boolean
  /** Open this URL in a tab once the window is ready (e.g. an OS-handed link). */
  initialUrl?: string
}

export class WindowController {
  readonly window: BaseWindow
  readonly chrome: WebContentsView
  readonly tabManager: TabManager
  readonly downloads: DownloadManager
  readonly incognito: boolean
  private copilot: CopilotPanel

  constructor(opts: WindowOptions = {}) {
    this.incognito = Boolean(opts.incognito)
    const ses = this.incognito ? privateSession() : browserSession()
    registerHelixisProtocol(ses)
    if (!permissionInstalled.has(ses)) {
      installPermissionHandlers(ses)
      permissionInstalled.add(ses)
    }

    const ws = readJSON<WindowState>(WINDOW_STATE_FILE, { width: 1440, height: 900 })
    this.window = new BaseWindow({
      width: ws.width,
      height: ws.height,
      x: ws.x,
      y: ws.y,
      minWidth: 900,
      minHeight: 600,
      title: this.incognito ? 'Helixis (Private)' : 'Helixis',
      backgroundColor: this.incognito ? '#1a1430' : '#0f1115'
    })
    if (!this.incognito && ws.maximized) this.window.maximize()

    if (!this.incognito) {
      const persistWindow = debounce(() => this.saveWindowState(), 400)
      this.window.on('resize', persistWindow)
      this.window.on('move', persistWindow)
      this.window.on('close', () => this.saveWindowState())
    }

    this.chrome = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    this.window.contentView.addChildView(this.chrome)

    this.tabManager = new TabManager(this.window, this.chrome, ses)
    this.copilot = new CopilotPanel(this.window, ses)
    this.downloads = new DownloadManager(ses, (items) => this.send('shell:downloads', items))

    // Only normal windows persist their tab session.
    if (!this.incognito) {
      const persistSession = debounce(
        () => writeJSON(SESSION_FILE, this.tabManager.serialize()),
        500
      )
      this.tabManager.setPersistHandler(persistSession)
    }

    controllers.add(this)
    this.window.on('closed', () => controllers.delete(this))

    if (process.env.ELECTRON_RENDERER_URL) {
      this.chrome.webContents.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
      this.chrome.webContents.loadFile(join(__dirname, '../renderer/index.html'))
    }

    this.chrome.webContents.once('did-finish-load', () => {
      const [w, h] = this.window.getContentSize()
      this.chrome.setBounds({ x: 0, y: 0, width: w, height: h })
      this.openInitialTab(opts)
    })
  }

  private openInitialTab(opts: WindowOptions): void {
    const override = process.env.HELIXIS_HOME
    let opened = false
    if (opts.restore && override) {
      this.tabManager.createTab(override)
      opened = true
    } else if (opts.restore && !this.incognito && getSettings().restoreSession) {
      const session = readJSON<SessionState>(SESSION_FILE, { tabs: [], active: 0 })
      if (this.tabManager.restore(session)) opened = true
    }
    if (!opened && !opts.initialUrl) {
      this.tabManager.createTab(this.incognito ? NEWTAB_URL : homeUrl())
    }
    if (opts.initialUrl) this.tabManager.createTab(opts.initialUrl)
  }

  /** Show/hide the docked copilot panel, resizing page content to fit. */
  toggleCopilot(): void {
    const open = this.copilot.toggle()
    this.tabManager.setRightInset(open ? COPILOT_WIDTH : 0)
  }

  send(channel: string, payload: unknown): void {
    if (!this.chrome.webContents.isDestroyed()) this.chrome.webContents.send(channel, payload)
  }

  focus(): void {
    if (this.window.isMinimized()) this.window.restore()
    this.window.focus()
  }

  private saveWindowState(): void {
    const maximized = this.window.isMaximized()
    const prev = readJSON<WindowState>(WINDOW_STATE_FILE, { width: 1440, height: 900 })
    const next: WindowState = { ...prev, maximized }
    if (!maximized) {
      const b = this.window.getBounds()
      next.width = b.width
      next.height = b.height
      next.x = b.x
      next.y = b.y
    }
    writeJSON(WINDOW_STATE_FILE, next)
  }
}

export function createBrowserWindow(opts: WindowOptions = {}): WindowController {
  return new WindowController(opts)
}

export function controllerForSender(sender: WebContents): WindowController | null {
  for (const c of controllers) if (c.chrome.webContents === sender) return c
  return null
}

export function focusedController(): WindowController | null {
  const focused = BaseWindow.getFocusedWindow()
  if (focused) {
    for (const c of controllers) if (c.window === focused) return c
  }
  return [...controllers].pop() ?? null
}

export function windowCount(): number {
  return controllers.size
}

export function broadcast(channel: string, payload: unknown): void {
  for (const c of controllers) c.send(channel, payload)
}

/** Persist every normal window's tab session (called on quit). */
export function flushSessions(): void {
  for (const c of controllers) {
    if (!c.incognito) writeJSON(SESSION_FILE, c.tabManager.serialize())
  }
}
