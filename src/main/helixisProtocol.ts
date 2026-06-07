import { type Session } from 'electron'
import { HELIXIS_SCHEME } from '../shared/layout'
import { newtabHTML } from './newtab'
import { errorPageHTML } from './errorpage'
import { searchUrl } from './settings'

/** Serve Helixis-branded pages (new-tab and error pages) over helixis://. */
export function handleHelixisRequest(request: Request): Response {
  try {
    const url = new URL(request.url)
    if (url.hostname === 'newtab') return html(newtabHTML(searchUrl()))
    if (url.hostname === 'error') {
      return html(
        errorPageHTML(
          url.searchParams.get('u') ?? '',
          url.searchParams.get('code') ?? '',
          url.searchParams.get('msg') ?? ''
        )
      )
    }
    return new Response('Not found', { status: 404 })
  } catch {
    return new Response('Error', { status: 500 })
  }
}

function html(body: string): Response {
  return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}

// Protocol handlers are per-session; register once per session (each window's
// content session, including private ones).
const registered = new WeakSet<Session>()

export function registerHelixisProtocol(ses: Session): void {
  if (registered.has(ses)) return
  ses.protocol.handle(HELIXIS_SCHEME, handleHelixisRequest)
  registered.add(ses)
}
