import { join } from 'node:path'
import { app, BaseWindow, WebContentsView, protocol } from 'electron'
import { TabManager } from './TabManager'
import { registerIpc } from './ipc'
import { installAppMenu } from './menu'
import { browserSession } from './sessions'
import { readJSON, writeJSON, debounce } from './store'
import { HOME_URL, HELIXIS_SCHEME } from '../shared/layout'
import { NEWTAB_HTML } from './newtab'
import { errorPageHTML } from './errorpage'

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

/** Serve Helixis-branded pages (new-tab and error pages) over helixis://. */
function handleHelixisRequest(request: Request): Response {
  try {
    const url = new URL(request.url)
    if (url.hostname === 'newtab') {
      return new Response(NEWTAB_HTML, {
        headers: { 'content-type': 'text/html; charset=utf-8' }
      })
    }
    if (url.hostname === 'error') {
      const html = errorPageHTML(
        url.searchParams.get('u') ?? '',
        url.searchParams.get('code') ?? '',
        url.searchParams.get('msg') ?? ''
      )
      return new Response(html, {
        headers: { 'content-type': 'text/html; charset=utf-8' }
      })
    }
    return new Response('Not found', { status: 404 })
  } catch {
    return new Response('Error', { status: 500 })
  }
}

// The custom scheme must be registered as privileged before the app is ready so
// pages served over helixis:// behave like normal secure, standard-origin pages.
protocol.registerSchemesAsPrivileged([
  {
    scheme: HELIXIS_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true }
  }
])

// --- Chrome DevTools Protocol -------------------------------------------------
// Expose CDP so the Weeks 3-4 execution layer (Playwright via
// chromium.connectOverCDP) can attach to this exact headed browser process —
// the architectural reason to embed CDP in the shell rather than spawning a
// separate, more-detectable headless browser (report Risk 4).
const cdpPort = resolveCdpPort()
if (cdpPort !== null) {
  app.commandLine.appendSwitch('remote-debugging-port', String(cdpPort))
  app.commandLine.appendSwitch('remote-allow-origins', '*')
}

function resolveCdpPort(): number | null {
  if (process.env.HELIXIS_CDP === '0') return null
  const fromEnv = process.env.HELIXIS_CDP_PORT
  if (fromEnv) {
    const n = Number(fromEnv)
    return Number.isInteger(n) && n > 0 ? n : null
  }
  // On by default in dev; opt-in for packaged builds via HELIXIS_CDP_PORT.
  return app.isPackaged ? null : 9222
}

let tabManager: TabManager | null = null

function saveWindowState(window: BaseWindow): void {
  const maximized = window.isMaximized()
  const prev = readJSON<WindowState>(WINDOW_STATE_FILE, { width: 1440, height: 900 })
  const next: WindowState = { ...prev, maximized }
  if (!maximized) {
    const b = window.getBounds()
    next.width = b.width
    next.height = b.height
    next.x = b.x
    next.y = b.y
  }
  writeJSON(WINDOW_STATE_FILE, next)
}

function createWindow(): void {
  const ws = readJSON<WindowState>(WINDOW_STATE_FILE, { width: 1440, height: 900 })
  const window = new BaseWindow({
    width: ws.width,
    height: ws.height,
    x: ws.x,
    y: ws.y,
    minWidth: 900,
    minHeight: 600,
    title: 'Helixis',
    backgroundColor: '#0f1115'
  })
  if (ws.maximized) window.maximize()

  const persistWindow = debounce(() => saveWindowState(window), 400)
  window.on('resize', persistWindow)
  window.on('move', persistWindow)
  window.on('close', () => saveWindowState(window))

  // The chrome view hosts the React UI (sidebar + tab bar) and spans the whole
  // window. Content tab views are layered on top of it.
  const chrome = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  window.contentView.addChildView(chrome)

  tabManager = new TabManager(window, chrome)
  registerIpc(tabManager, cdpPort)
  installAppMenu(tabManager)

  // Persist the open-tab session (debounced) for restore on next launch.
  const persistSession = debounce(() => {
    if (tabManager) writeJSON(SESSION_FILE, tabManager.serialize())
  }, 500)
  tabManager.setPersistHandler(persistSession)

  if (process.env.ELECTRON_RENDERER_URL) {
    chrome.webContents.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    chrome.webContents.loadFile(join(__dirname, '../renderer/index.html'))
  }

  chrome.webContents.once('did-finish-load', () => {
    const [w, h] = window.getContentSize()
    chrome.setBounds({ x: 0, y: 0, width: w, height: h })
    // Restore last session's tabs, or open a single home tab. An explicit
    // HELIXIS_HOME override always wins (used in dev/testing).
    const override = process.env.HELIXIS_HOME
    const session = readJSON<SessionState>(SESSION_FILE, { tabs: [], active: 0 })
    if (override) tabManager?.createTab(override)
    else if (!tabManager?.restore(session)) tabManager?.createTab(HOME_URL)
  })
}

app.whenReady().then(() => {
  // Register the helixis:// handler on the *same* session the tabs use (a custom
  // persistent partition) — protocol handlers are per-session, and the default
  // session's registry does not apply to other partitions. Also register on the
  // default session for completeness.
  protocol.handle(HELIXIS_SCHEME, handleHelixisRequest)
  browserSession().protocol.handle(HELIXIS_SCHEME, handleHelixisRequest)

  createWindow()

  app.on('activate', () => {
    if (BaseWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  if (tabManager) writeJSON(SESSION_FILE, tabManager.serialize())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
