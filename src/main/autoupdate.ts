// Auto-update for installed builds.
//
// electron-updater checks the GitHub Release feed (configured under `publish`
// in electron-builder.yml), downloads a newer installer in the background, and
// swaps it in on next quit. Testers just keep the app open — the next launch
// after a release is the new version. No manual re-download.
//
// Two hard rules, both about never letting an update check hurt the shell:
//   1. Packaged-only. In dev (`electron-vite dev`) there is no installer to
//      replace and no baked update feed, so we no-op.
//   2. Fail soft. macOS auto-update requires a *signed* build — Squirrel.Mac
//      refuses unsigned updates — so on our current unsigned tester builds the
//      check emits an error. We log it and move on. Windows (NSIS) and Linux
//      (AppImage) auto-update work unsigned, so those testers get updates now;
//      macOS testers download each new .dmg by hand until signing is added.
//
// Wiring is a single `initAutoUpdate()` call from the app's `whenReady`.

import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

let started = false

export function initAutoUpdate(): void {
  if (started) return
  started = true

  if (!app.isPackaged) return

  // Download in the background and install on quit — the least-intrusive flow
  // for testers (no mid-session prompts).
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  // The 'error' listener is what makes the unsigned-macOS path safe: the failed
  // check surfaces here instead of as an unhandled rejection.
  autoUpdater.on('error', (err) => {
    console.warn('[autoupdate] check failed (non-fatal):', err?.message ?? err)
  })
  autoUpdater.on('update-available', (info) => {
    console.info('[autoupdate] update available:', info?.version)
  })
  autoUpdater.on('update-not-available', () => {
    console.info('[autoupdate] up to date')
  })
  autoUpdater.on('update-downloaded', (info) => {
    console.info('[autoupdate] downloaded', info?.version, '— installs on next quit')
  })

  // Fire-and-forget. A rejection (unsigned macOS, or no update feed baked into
  // this build) is already reported through the 'error' listener above, so the
  // catch just keeps it from becoming an unhandled promise rejection.
  autoUpdater.checkForUpdatesAndNotify().catch(() => {
    /* handled by the 'error' listener */
  })
}
