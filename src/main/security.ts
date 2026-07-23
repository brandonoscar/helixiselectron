/**
 * IPC sender classification + external-URL and CDP policy.
 *
 * The 2026-07 security audit found three exposures, all fixed here as PURE,
 * unit-tested helpers the wiring code consumes:
 *
 * 1. Every global IPC handler ignored `event.sender` — and the copilot panel
 *    loads a REMOTE origin (the deployed chat app) with the same privileged
 *    preload as the internal chrome, so the remote page could invoke
 *    settings:clearData, history:*, bookmarks:*, etc. `classifySenderUrl`
 *    splits senders into chrome / copilot / untrusted; the guard in ipc.ts
 *    grants the copilot ONLY the channels its feature needs (page context).
 *
 * 2. The copilot's window-open handler forwarded ANY url to
 *    shell.openExternal — a remote-controlled URI-scheme launch.
 *    `isSafeExternalUrl` allows exactly http(s) and mailto.
 *
 * 3. HELIXIS_CDP_PORT re-enabled remote debugging (with
 *    remote-allow-origins=*) even on PACKAGED builds, because the env check
 *    preceded the isPackaged guard. `cdpPortFor` makes packaged builds
 *    unconditionally CDP-off — local-browser driving stays gated on ADR 0004
 *    and is not re-enterable via an env var on a shipped binary.
 */

export type SenderKind = 'chrome' | 'copilot' | 'untrusted'

export interface SenderPolicy {
  /** electron-vite dev server URL for the chrome renderer, if running. */
  rendererUrl: string | null
  /** Origin of the hosted copilot web app (deployed chat surface). */
  copilotOrigin: string
}

/** Classify an IPC sender by its document URL. Fail-closed: anything that
 *  isn't provably the internal chrome or the configured copilot origin —
 *  including malformed URLs — is untrusted. */
export function classifySenderUrl(url: string | undefined, policy: SenderPolicy): SenderKind {
  if (!url) return 'untrusted'
  // Packaged chrome renderer: the bundled file:// index.html.
  if (url.startsWith('file://') && url.includes('/renderer/')) return 'chrome'
  // Dev chrome renderer: the electron-vite dev server.
  if (policy.rendererUrl && url.startsWith(policy.rendererUrl)) return 'chrome'
  try {
    if (new URL(url).origin === policy.copilotOrigin) return 'copilot'
  } catch {
    return 'untrusted'
  }
  return 'untrusted'
}

/** Only ever hand these schemes to shell.openExternal. Everything else
 *  (file:, javascript:, custom app schemes a remote page could weaponize)
 *  is dropped. */
export function isSafeExternalUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol
    return protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:'
  } catch {
    return false
  }
}

/** CDP policy: packaged builds NEVER expose a debugging port — no env
 *  override (local-browser driving is gated on ADR 0004, not an env var).
 *  Dev: HELIXIS_CDP=0 disables, HELIXIS_CDP_PORT overrides, default 9222. */
export function cdpPortFor(
  env: Record<string, string | undefined>,
  isPackaged: boolean
): number | null {
  if (isPackaged) return null
  if (env.HELIXIS_CDP === '0') return null
  const fromEnv = env.HELIXIS_CDP_PORT
  if (fromEnv) {
    const n = Number(fromEnv)
    return Number.isInteger(n) && n > 0 ? n : null
  }
  return 9222
}
