import type { Session, WebContents } from 'electron'

/**
 * The copilot panel's network bridge: fetch() run by the main process.
 *
 * Why it exists: the panel is served from app://copilot, and the backend's
 * CORS list (AgenticHelixis api/middleware.py CONTRACT_ORIGINS) names web
 * origins only, so a direct fetch from the panel fails preflight. The Chrome
 * extension never hit this because extension pages are exempt from CORS. A
 * request made by the main process is not a page request, so CORS does not
 * apply, and no backend change is needed.
 *
 * Why it is safe: it reaches exactly two origins, the backend and the live
 * Supabase project's auth API, the same two the extension's config.js names
 * (copilotNet.test.ts reads config.js and fails on drift). It is not an open
 * proxy, and it adds no credentials of its own: the panel's bearer token is
 * forwarded as the panel sent it.
 */
export const COPILOT_HTTP_ORIGINS = [
  'https://agentichelixis.onrender.com',
  'https://shwwcxkeewpotnigwvqp.supabase.co'
]

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
const MAX_BODY_BYTES = 1_000_000
const MAX_HEADERS = 50
// Headers the page has no business setting; the network stack owns them.
const DROPPED_HEADERS = new Set(['host', 'cookie', 'origin', 'referer', 'content-length', 'connection'])

export interface CopilotHttpRequest {
  id: string
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

export interface CopilotHttpHead {
  status: number
  statusText: string
  headers: [string, string][]
}

/** Validate an untrusted request from the panel. Null means refuse. */
export function parseHttpRequest(raw: unknown): CopilotHttpRequest | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || !/^[\w-]{8,64}$/.test(r.id)) return null
  if (typeof r.url !== 'string') return null
  let url: URL
  try {
    url = new URL(r.url)
  } catch {
    return null
  }
  if (!COPILOT_HTTP_ORIGINS.includes(url.origin)) return null
  const method = typeof r.method === 'string' ? r.method.toUpperCase() : ''
  if (!METHODS.has(method)) return null
  if (r.body !== undefined && typeof r.body !== 'string') return null
  if (typeof r.body === 'string' && Buffer.byteLength(r.body) > MAX_BODY_BYTES) return null

  const headers: Record<string, string> = {}
  const rawHeaders = r.headers ?? {}
  if (typeof rawHeaders !== 'object') return null
  const entries = Object.entries(rawHeaders as Record<string, unknown>)
  if (entries.length > MAX_HEADERS) return null
  for (const [k, v] of entries) {
    if (typeof v !== 'string' || /[\r\n]/.test(k) || /[\r\n]/.test(v)) return null
    if (!DROPPED_HEADERS.has(k.toLowerCase())) headers[k] = v
  }
  return { id: r.id, url: url.toString(), method, headers, body: r.body as string | undefined }
}

/**
 * Runs bridged requests for copilot views and streams each body back as
 * `copilot:http:chunk` / `:end` / `:error` messages keyed by request id.
 */
export class CopilotNet {
  private inflight = new Map<string, AbortController>()

  constructor(private session: Session) {}

  /** Start a request; resolves with the response head once headers arrive. */
  async start(wc: WebContents, req: CopilotHttpRequest): Promise<CopilotHttpHead> {
    const abort = new AbortController()
    this.inflight.set(req.id, abort)
    let res: Response
    try {
      res = await this.session.fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
        signal: abort.signal
      })
    } catch (err) {
      this.inflight.delete(req.id)
      throw new Error(err instanceof Error ? err.message : 'Network request failed')
    }
    void this.pump(wc, req.id, res)
    return {
      status: res.status,
      statusText: res.statusText,
      headers: [...res.headers].filter(([k]) => k.toLowerCase() !== 'set-cookie')
    }
  }

  abort(id: string): void {
    this.inflight.get(id)?.abort()
    this.inflight.delete(id)
  }

  /** Abort everything a closing panel still had open. */
  abortAll(): void {
    for (const a of this.inflight.values()) a.abort()
    this.inflight.clear()
  }

  private async pump(wc: WebContents, id: string, res: Response): Promise<void> {
    const send = (channel: string, ...args: unknown[]) => {
      if (!wc.isDestroyed()) wc.send(channel, id, ...args)
    }
    try {
      if (res.body) {
        const reader = res.body.getReader()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (wc.isDestroyed()) {
            this.abort(id)
            return
          }
          send('copilot:http:chunk', value)
        }
      }
      send('copilot:http:end')
    } catch (err) {
      // An abort the panel asked for needs no error message back.
      if (this.inflight.has(id)) send('copilot:http:error', err instanceof Error ? err.message : 'Stream failed')
    } finally {
      this.inflight.delete(id)
    }
  }
}
