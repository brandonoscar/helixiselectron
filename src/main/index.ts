import { join } from 'node:path'
import { app, protocol, session } from 'electron'
import { registerIpc } from './ipc'
import { registerCopilotIpc } from './copilotIpc'
import { copilotSession } from './copilot'
import { APP_SCHEME, registerAppProtocol } from './appProtocol'
import { installAppPagePermissions } from './permissions'
import { cdpPortFor, CHROME_HOST } from './security'
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
import { APP_ID, HELIXIS_SCHEME } from '../shared/layout'

// Custom schemes must be registered as privileged before the app is ready so
// their pages behave like normal secure, standard-origin pages. helixis:// is
// the tabs' new-tab/search/error pages; app:// is the app's own UI (the
// chrome and the copilot, appProtocol.ts). One call: a second one replaces
// the first.
protocol.registerSchemesAsPrivileged([
  {
    scheme: HELIXIS_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true }
  },
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true }
  }
])

// No app.enableSandbox(): it also overrides --no-sandbox, the documented
// workaround on Linux machines where Chromium's sandbox cannot start (e.g. the
// AppImage under Ubuntu 24.04's user-namespace restrictions), which would
// leave those users unable to launch at all. Every view sets `sandbox: true`
// itself instead, and security.test.ts fails on any view that does not.

// Windows ties notifications and taskbar badges to this id, and it must equal
// the installer's shortcut id (electron-builder uses `appId`). Changing either
// alone silently breaks notifications.
if (process.platform === 'win32') app.setAppUserModelId(APP_ID)

// The chrome UI's CSP. Favicons come from any site (or data: URLs); the UI
// itself loads only its own bundle.
const CHROME_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https: http:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'"
].join('; ')

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
    // Feeds the macOS native About panel (Menu → About Helixis) + the
    // Help → About dialog with the running version/copyright. Version is the
    // single source of truth from package.json via app.getVersion().
    app.setAboutPanelOptions({
      applicationName: 'Occupella',
      applicationVersion: app.getVersion(),
      version: app.getVersion(),
      copyright: '© Occupella'
    })

    // The chrome views use the default session; it serves only the chrome UI.
    registerAppProtocol(session.defaultSession, {
      [CHROME_HOST]: { root: join(__dirname, '../renderer'), csp: CHROME_CSP }
    })
    installAppPagePermissions(session.defaultSession)
    installAppPagePermissions(copilotSession())

    registerIpc(cdpPort)
    registerCopilotIpc()
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
