// The Helixis-branded web search results page, served over
// `helixis://search?q=…` (see helixisProtocol.ts). The main process fetches
// results from the Helixis backend (`/api/v1/search`) and bakes them into
// this self-contained HTML — no external assets, no client-side fetch, no
// CORS, and no API key in the renderer. Same visual language as newtab.ts so
// search feels like part of the browser, under the Helixis mark.

export interface SearchResultItem {
  title: string
  url: string
  snippet: string
}

export interface SearchPageData {
  query: string
  answer?: string | null
  results: SearchResultItem[]
  warnings: string[]
}

/** Escape text destined for HTML — result titles/snippets/answers come from
 *  the open web, so every interpolated string is escaped to prevent markup
 *  injection into this trusted helixis:// page. */
function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Human-readable host for the result's citation line. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** A self-contained favicon chip for a result: the host's first letter on a
 *  colour derived deterministically from the hostname. Keeps this page fully
 *  self-contained (no external favicon fetch — which would leak every result
 *  domain to a third party and break the "no external assets" design), while
 *  still giving each link a stable, recognisable mark instead of an empty slot.
 *  The hue is a cheap hash of the host, so the same site always gets the same
 *  colour. */
function faviconChip(url: string): string {
  const host = hostOf(url)
  const letter = esc((host.replace(/^[^a-z0-9]+/i, '')[0] || '?').toUpperCase())
  let hash = 0
  for (let i = 0; i < host.length; i++) hash = (hash * 31 + host.charCodeAt(i)) >>> 0
  const hue = hash % 360
  return `<span class="favicon" style="background:hsl(${hue} 42% 44%)" aria-hidden="true">${letter}</span>`
}

function resultRow(r: SearchResultItem): string {
  const safeUrl = esc(r.url)
  return `
    <a class="result" href="${safeUrl}">
      <div class="result-cite">
        ${faviconChip(r.url)}
        <span class="result-host">${esc(hostOf(r.url))}</span>
      </div>
      <div class="result-title">${esc(r.title || r.url)}</div>
      ${r.snippet ? `<div class="result-snippet">${esc(r.snippet)}</div>` : ''}
    </a>`
}

/**
 * @param data          results fetched from the backend (or empty on failure)
 * @param searchAction  the base URL the search box submits to (helixis://search)
 * @param failed        true when the backend fetch itself errored (network /
 *                      timeout) — distinct from "search ran but found nothing"
 */
export function searchResultsHTML(
  data: SearchPageData,
  searchAction: string,
  failed = false
): string {
  const q = esc(data.query)
  const degraded =
    failed ||
    data.warnings.includes('search_unavailable') ||
    data.warnings.includes('search_unauthorized')

  let body: string
  if (degraded) {
    body = `<div class="notice">
      <div class="notice-title">Search is unavailable right now</div>
      <div class="notice-sub">Couldn't reach Occupella search. Check your connection and try again.</div>
    </div>`
  } else if (data.results.length === 0) {
    body = `<div class="notice">
      <div class="notice-title">No results for &ldquo;${q}&rdquo;</div>
      <div class="notice-sub">Try different or more general words.</div>
    </div>`
  } else {
    const answer = data.answer
      ? `<div class="answer"><div class="answer-label">Summary</div>${esc(data.answer)}</div>`
      : ''
    body = answer + data.results.map(resultRow).join('')
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${q ? `${q} — Occupella` : 'Occupella Search'}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: radial-gradient(1200px 600px at 50% -10%, #1b2030 0%, #0f1115 60%) fixed;
    color: #e6e9ef;
    padding: 0 0 64px;
  }
  header {
    position: sticky; top: 0;
    display: flex; align-items: center; gap: 18px;
    padding: 18px 28px;
    background: rgba(15,17,21,0.82);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid #1c212c;
  }
  .brand { display: flex; align-items: center; gap: 9px; flex-shrink: 0; }
  .mark { color: #5b8cff; font-size: 24px; line-height: 1; }
  .name { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
  form { flex: 1; max-width: 620px; position: relative; }
  input {
    width: 100%;
    padding: 11px 16px;
    font-size: 15px;
    color: #e6e9ef;
    background: rgba(255,255,255,0.04);
    border: 1px solid #2a2f3a;
    border-radius: 22px;
    outline: none;
  }
  input::placeholder { color: #8b93a3; }
  input:focus { border-color: #5b8cff; background: rgba(91,140,255,0.06); }
  main { max-width: 680px; margin: 0 auto; padding: 26px 28px 0; }
  .answer {
    background: rgba(91,140,255,0.07);
    border: 1px solid rgba(91,140,255,0.22);
    border-radius: 12px;
    padding: 14px 16px;
    margin-bottom: 26px;
    line-height: 1.5;
    font-size: 14.5px;
  }
  .answer-label {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em;
    color: #5b8cff; margin-bottom: 6px;
  }
  .result { display: block; text-decoration: none; color: inherit; margin-bottom: 24px; }
  .result-cite { display: flex; align-items: center; gap: 8px; margin-bottom: 3px; }
  .favicon {
    width: 18px; height: 18px; border-radius: 4px; flex-shrink: 0;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; color: #fff; line-height: 1;
  }
  .result-host { font-size: 12.5px; color: #8b93a3; }
  .result-title { font-size: 18px; color: #8ab4ff; line-height: 1.3; }
  .result:hover .result-title { text-decoration: underline; }
  .result-snippet { font-size: 13.5px; color: #b8bfcc; line-height: 1.5; margin-top: 4px; }
  .notice { text-align: center; padding: 80px 20px; color: #8b93a3; }
  .notice-title { font-size: 18px; color: #e6e9ef; margin-bottom: 8px; }
  .notice-sub { font-size: 13.5px; }
</style>
</head>
<body>
  <header>
    <div class="brand"><span class="mark">◐</span><span class="name">Occupella</span></div>
    <form action="${esc(searchAction)}" method="GET" autocomplete="off">
      <input name="q" value="${q}" placeholder="Search the web" aria-label="Search" />
    </form>
  </header>
  <main>${body}</main>
</body>
</html>`
}
