// The Helixis-branded web search results page, served over
// `helixis://search?q=…` (see helixisProtocol.ts). The main process fetches
// results from the Helixis backend (`/api/v1/search`) and bakes them into
// this self-contained HTML — no external assets, no client-side fetch, no
// CORS, and no API key in the renderer. Same visual language as newtab.ts so
// search feels like part of the browser, under the Helixis mark.

import { NEWTAB_URL } from '../shared/layout'

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

function resultRow(r: SearchResultItem): string {
  const safeUrl = esc(r.url)
  const host = hostOf(r.url)
  // Favicon via DuckDuckGo's icon service (privacy-respecting, not Google).
  // onerror hides a broken icon so the row never shows a missing-image glyph.
  const favicon = `<img class="favicon" src="https://icons.duckduckgo.com/ip3/${esc(host)}.ico" onerror="this.style.display='none'" alt="" />`
  return `
    <a class="result" href="${safeUrl}">
      <div class="result-host">${favicon}${esc(host)}</div>
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
      <div class="notice-sub">Couldn't reach Helixis search. Check your connection and try again.</div>
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
    const n = data.results.length
    const count = `<div class="result-count">${n} result${n === 1 ? '' : 's'} for &ldquo;${q}&rdquo;</div>`
    body = count + answer + data.results.map(resultRow).join('')
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${q ? `${q} — Helixis` : 'Helixis Search'}</title>
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
  .brand { display: flex; align-items: center; gap: 9px; flex-shrink: 0; text-decoration: none; color: inherit; }
  .mark { color: #5b8cff; font-size: 24px; line-height: 1; }
  .name { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
  form { flex: 1; max-width: 620px; position: relative; }
  .recent {
    position: absolute; left: 0; right: 0; top: calc(100% + 6px);
    background: #161a22; border: 1px solid #2a2f3a; border-radius: 14px;
    overflow: hidden; display: none; z-index: 20;
    box-shadow: 0 12px 28px -8px rgba(0,0,0,0.55);
  }
  .recent-item { padding: 10px 16px; font-size: 14px; color: #cdd3de; cursor: pointer; }
  .recent-item:hover { background: rgba(255,255,255,0.05); }
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
  .result-count { font-size: 12.5px; color: #8b93a3; margin-bottom: 18px; }
  .result { display: block; text-decoration: none; color: inherit; margin-bottom: 24px; }
  .result-host { font-size: 12.5px; color: #8b93a3; margin-bottom: 2px; display: flex; align-items: center; }
  .favicon { width: 15px; height: 15px; border-radius: 3px; margin-right: 7px; flex-shrink: 0; }
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
    <a class="brand" href="${NEWTAB_URL}" title="Helixis home">
      <span class="mark">◐</span><span class="name">Helixis</span>
    </a>
    <form id="searchform" action="${esc(searchAction)}" method="GET" autocomplete="off">
      <input id="q" name="q" value="${q}" placeholder="Search the web" aria-label="Search" />
      <div id="recent" class="recent"></div>
    </form>
  </header>
  <main>${body}</main>
  <script>
  (function () {
    var KEY = 'helixis:recent'
    var form = document.getElementById('searchform')
    var input = document.getElementById('q')
    var box = document.getElementById('recent')
    function read() { try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch (e) { return [] } }
    function write(a) { try { localStorage.setItem(KEY, JSON.stringify(a.slice(0, 8))) } catch (e) {} }
    // Record the current query (most-recent-first, de-duped).
    var cur = (new URLSearchParams(location.search).get('q') || '').trim()
    if (cur) {
      var a = read().filter(function (x) { return x.toLowerCase() !== cur.toLowerCase() })
      a.unshift(cur)
      write(a)
    }
    function render() {
      var a = read()
      box.textContent = ''
      if (!a.length) { box.style.display = 'none'; return }
      a.forEach(function (qq) {
        var li = document.createElement('div')
        li.className = 'recent-item'
        li.textContent = qq // textContent → safe against crafted past queries
        // mousedown (not click) so it fires before the input's blur hides the box
        li.addEventListener('mousedown', function (e) { e.preventDefault(); input.value = qq; form.submit() })
        box.appendChild(li)
      })
    }
    input.addEventListener('focus', function () { render(); if (box.children.length) box.style.display = 'block' })
    input.addEventListener('blur', function () { setTimeout(function () { box.style.display = 'none' }, 120) })
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape') box.style.display = 'none' })
  })()
  </script>
</body>
</html>`
}
