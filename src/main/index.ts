import { app, protocol } from 'electron'
import { registerIpc } from './ipc'
import { cdpPortFor } from './security'
import { initAutoUpdate } from './autoupdate'
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
// attach to this exact headed browser process — DEV ONLY. Packaged builds are
// unconditionally CDP-off (2026-07 audit: the env check used to precede the
// isPackaged guard, so HELIXIS_CDP_PORT could re-enable remote debugging —
// with remote-allow-origins=* — on a shipped binary). Local-browser driving
// is gated on ADR 0004, not an env var; policy in security.cdpPortFor.
const cdpPort = cdpPortFor(process.env, app.isPackaged)
if (cdpPort !== null) {
  app.commandLine.appendSwitch('remote-debugging-port', String(cdpPort))
  app.commandLine.appendSwitch('remote-allow-origins', '*')
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
    // Feeds the macOS native About panel (Menu → About Occupella) + the
    // Help → About dialog with the running version. Version is the single
    // source of truth from package.json via app.getVersion(). Copyright is
    // omitted until the legal entity is finalized (ToS/legal pass).
    app.setAboutPanelOptions({
      applicationName: 'Occupella',
      applicationVersion: app.getVersion(),
      version: app.getVersion()
    })

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

    // Background update check for installed builds (no-op in dev, fail-soft on
    // unsigned macOS). Runs after the window is up so it never delays launch.
    initAutoUpdate()
  })
}

app.on('before-quit', () => flushSessions())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
