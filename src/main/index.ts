import { join } from 'node:path'
import { app, BaseWindow, WebContentsView, protocol } from 'electron'
import { TabManager } from './TabManager'
import { registerIpc } from './ipc'
import { browserSession } from './sessions'
import { HOME_URL, HELIXIS_SCHEME } from '../shared/layout'
import { NEWTAB_HTML } from './newtab'

/** Serve Helixis-branded pages (the new-tab/home page) over helixis://. */
function handleHelixisRequest(request: Request): Response {
  try {
    const { hostname } = new URL(request.url)
    if (hostname === 'newtab') {
      return new Response(NEWTAB_HTML, {
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

function createWindow(): void {
  const window = new BaseWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Helixis',
    backgroundColor: '#0f1115'
  })

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

  if (process.env.ELECTRON_RENDERER_URL) {
    chrome.webContents.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    chrome.webContents.loadFile(join(__dirname, '../renderer/index.html'))
  }

  chrome.webContents.once('did-finish-load', () => {
    const [w, h] = window.getContentSize()
    chrome.setBounds({ x: 0, y: 0, width: w, height: h })
    // Open a home tab so the app starts as a usable browser.
    tabManager?.createTab(process.env.HELIXIS_HOME || HOME_URL)
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
