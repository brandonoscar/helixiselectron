import { app, protocol } from 'electron'
import { registerIpc } from './ipc'
import { installAppMenu } from './menu'
import { setBookmarksNotifier } from './bookmarks'
import {
  createBrowserWindow,
  focusedController,
  broadcast,
  flushSessions,
  windowCount
} from './windows'
import { HELIXIS_SCHEME } from '../shared/layout'

// The custom scheme must be registered as privileged before the app is ready so
// pages served over helixis:// behave like normal secure, standard-origin pages.
protocol.registerSchemesAsPrivileged([
  {
    scheme: HELIXIS_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true }
  }
])

// --- Chrome DevTools Protocol -------------------------------------------------
// Expose CDP so an execution layer (Playwright via chromium.connectOverCDP) can
// attach to this exact headed browser process.
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
  return app.isPackaged ? null : 9222
}

/** Pull the first http(s) URL out of argv (used when the OS launches us to open
 *  a link, on Windows/Linux). */
function httpUrlFromArgv(argv: string[]): string | null {
  return argv.find((a) => /^https?:\/\//i.test(a)) ?? null
}

function openIncomingUrl(url: string): void {
  const c = focusedController()
  if (c) {
    c.focus()
    c.tabManager.createTab(url)
  } else {
    createBrowserWindow({ initialUrl: url })
  }
}

// Single-instance: a second launch focuses the existing window (and opens any
// URL it was asked to handle) instead of starting a new process.
const gotInstanceLock = app.requestSingleInstanceLock()
if (!gotInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const url = httpUrlFromArgv(argv)
    if (url) openIncomingUrl(url)
    else focusedController()?.focus()
  })

  // macOS delivers links to open via this event.
  app.on('open-url', (event, url) => {
    event.preventDefault()
    openIncomingUrl(url)
  })

  app.whenReady().then(() => {
    registerIpc(cdpPort)
    setBookmarksNotifier((items) => broadcast('shell:bookmarks', items))
    installAppMenu({
      focused: () => focusedController()?.tabManager ?? null,
      newWindow: () => createBrowserWindow({}),
      newPrivateWindow: () => createBrowserWindow({ incognito: true }),
      toggleCopilot: () => focusedController()?.toggleCopilot()
    })

    createBrowserWindow({ restore: true, initialUrl: httpUrlFromArgv(process.argv) ?? undefined })

    app.on('activate', () => {
      if (windowCount() === 0) createBrowserWindow({ restore: true })
    })
  })
}

app.on('before-quit', () => flushSessions())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
