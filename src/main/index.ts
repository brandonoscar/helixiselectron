import { join } from 'node:path'
import { app, BaseWindow, WebContentsView } from 'electron'
import { TabManager } from './TabManager'
import { registerIpc } from './ipc'

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
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BaseWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
