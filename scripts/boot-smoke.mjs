#!/usr/bin/env node
/**
 * CI boot-smoke for the Helixis Electron shell.
 *
 * Launches the BUILT app (out/main/index.js) headless — the workflow wraps this
 * in `xvfb-run` so Chromium has a virtual display — and asserts the main process
 * starts and creates its window WITHOUT crashing. The app is a long-running GUI,
 * so the pass/fail model is:
 *
 *   PASS  — the process stays alive and clean through a short settle window
 *           (the window was created and nothing threw on startup).
 *   FAIL  — it exits non-zero early (an uncaught error in the main process /
 *           app.whenReady rejects → Electron exits non-zero), OR a hard crash
 *           signature appears in its output, OR it never settles (hard timeout).
 *
 * No app code change is needed: an uncaught main-process error makes Electron
 * exit non-zero, which we detect here. Run AFTER `npm run build`.
 */
import { spawn } from 'node:child_process'

const SETTLE_MS = 8000 // alive + clean this long ⇒ booted OK
const HARD_TIMEOUT_MS = 30000

const electronBin =
  process.platform === 'win32'
    ? 'node_modules\\.bin\\electron.cmd'
    : 'node_modules/.bin/electron'

const child = spawn(electronBin, ['.'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    HELIXIS_CDP: '0', // no remote-debugging port in CI
    ELECTRON_DISABLE_SANDBOX: '1' // CI runners lack the SUID sandbox / user namespaces
  }
})

let settled = false
let buf = ''
// Only HARD crash signatures — Electron under xvfb prints benign GPU/dbus/MESA
// warnings that must NOT be treated as failures.
const FATAL =
  /(Uncaught (Exception|Error)|MODULE_NOT_FOUND|Cannot find module|A JavaScript error occurred in the main process)/i

const settleTimer = setTimeout(() => {
  settled = true
  finish(0, `window stayed up ${SETTLE_MS}ms with no crash — boot OK`)
}, SETTLE_MS)
const hardTimer = setTimeout(
  () => finish(1, 'hard timeout — app never settled'),
  HARD_TIMEOUT_MS
)

function finish(code, msg) {
  clearTimeout(settleTimer)
  clearTimeout(hardTimer)
  console.log(`[boot-smoke] ${msg}`)
  try {
    child.kill('SIGKILL')
  } catch {
    /* already gone */
  }
  process.exit(code)
}

function onData(chunk) {
  const s = chunk.toString()
  process.stdout.write(s) // surface app output in the CI log
  buf += s
  if (FATAL.test(buf)) finish(1, 'fatal crash signature in output')
}

child.stdout.on('data', onData)
child.stderr.on('data', onData)
child.on('error', (e) => finish(1, `failed to spawn electron: ${e.message}`))
child.on('exit', (code, signal) => {
  if (settled) return // we killed it after a successful settle
  finish(code === 0 ? 0 : 1, `electron exited early code=${code} signal=${signal}`)
})
