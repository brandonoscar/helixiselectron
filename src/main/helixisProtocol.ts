import { type Session } from 'electron'
import { HELIXIS_SCHEME } from '../shared/layout'
import { newtabHTML } from './newtab'
import { errorPageHTML } from './errorpage'
import { searchResultsHTML, type SearchPageData } from './searchpage'
import { HELIXIS_SEARCH_URL, searchApiBase, searchUrl } from './settings'

const SEARCH_FETCH_TIMEOUT_MS = 8000

/** Fetch results for the branded search page from the Helixis backend.
 *  Runs in the MAIN process (no CORS, no API key in the renderer). Any
 *  failure resolves to the branded "search unavailable" page rather than a
 *  raw protocol error, so the browser never shows a broken view. */
async function renderSearch(query: string): Promise<Response> {
  const empty: SearchPageData = { query, results: [], warnings: [] }
  if (!query) return html(searchResultsHTML(empty, HELIXIS_SEARCH_URL))

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SEARCH_FETCH_TIMEOUT_MS)
  try {
    const endpoint = `${searchApiBase()}/api/v1/search?q=${encodeURIComponent(query)}&max_results=8`
    const res = await fetch(endpoint, { signal: controller.signal })
    if (!res.ok) return html(searchResultsHTML(empty, HELIXIS_SEARCH_URL, true))
    const data = (await res.json()) as Partial<SearchPageData>
    const page: SearchPageData = {
      query: data.query || query,
      answer: data.answer ?? null,
      results: Array.isArray(data.results) ? data.results : [],
      warnings: Array.isArray(data.warnings) ? data.warnings : []
    }
    return html(searchResultsHTML(page, HELIXIS_SEARCH_URL))
  } catch {
    // Network error / timeout / bad JSON → branded failure page.
    return html(searchResultsHTML(empty, HELIXIS_SEARCH_URL, true))
  } finally {
    clearTimeout(timer)
  }
}

/** Serve Helixis-branded pages (new-tab, search, error) over helixis://. */
export async function handleHelixisRequest(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url)
    if (url.hostname === 'newtab') return html(newtabHTML(searchUrl()))
    if (url.hostname === 'search') {
      return await renderSearch((url.searchParams.get('q') ?? '').trim())
    }
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
