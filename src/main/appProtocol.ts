import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import type { Session } from 'electron'

/**
 * The app:// scheme: the browser's own bundled pages, served from disk.
 *
 *   app://chrome/   the React browser UI (tab strip + toolbar), default session
 *   app://copilot/  the Occupella copilot panel, persist:occupella session
 *
 * Why not file://: a file:// page gets extra privileges a web page never has
 * (Electron's GrantFileProtocolExtraPrivileges fuse, which packaged builds now
 * switch off), and every local file shares one origin. Here each host is its
 * own origin, only files under its root are reachable, and every response
 * carries a Content-Security-Policy.
 *
 * Each host is registered only on the session that needs it, so a web page in
 * a browser tab (a different session) cannot load app:// at all.
 */
export const APP_SCHEME = 'app'

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
}

export interface AppHost {
  /** Directory the host serves. */
  root: string
  /** Content-Security-Policy sent with every response. */
  csp: string
}

/**
 * Map a URL path onto a file inside `root`, or null when it would escape it.
 * The URL parser already collapses `..` segments; the percent-decoding below
 * can reintroduce them (`%2e%2e%2f`), hence the final containment check.
 */
export function resolveInside(root: string, pathname: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null
  const rel = decoded.replace(/^[/\\]+/, '') || 'index.html'
  const base = resolve(root)
  const full = resolve(base, rel)
  return full.startsWith(base + sep) ? full : null
}

export function contentTypeFor(file: string): string | null {
  return CONTENT_TYPES[extname(file).toLowerCase()] ?? null
}

/** Serve the given hosts over app:// on one session. Anything else is 404. */
export function registerAppProtocol(ses: Session, hosts: Record<string, AppHost>): void {
  ses.protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url)
    const host = hosts[url.host]
    const file = host ? resolveInside(host.root, url.pathname) : null
    const type = file ? contentTypeFor(file) : null
    if (!host || !file || !type) return new Response('Not found', { status: 404 })
    try {
      const body = await readFile(file)
      return new Response(body, {
        headers: {
          'content-type': type,
          'content-security-policy': host.csp,
          'x-content-type-options': 'nosniff'
        }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

/** True when `url` is a page served from app://<host>/. Node's URL gives a
 *  non-special scheme an opaque origin ("null"), so compare the parts, never
 *  `.origin`. */
export function isAppUrl(url: string | undefined, host: string): boolean {
  if (!url) return false
  try {
    const u = new URL(url)
    return u.protocol === `${APP_SCHEME}:` && u.host === host
  } catch {
    return false
  }
}
