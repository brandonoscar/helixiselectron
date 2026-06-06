// The page shown when a navigation fails, served over helixis://error. The
// failed URL, error code and description are passed as query params so the
// "Try again" link can point back at the original address.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function errorPageHTML(originalUrl: string, code: string, desc: string): string {
  const safeUrl = escapeHtml(originalUrl)
  const safeDesc = escapeHtml(desc || 'The page could not be loaded.')
  const safeCode = escapeHtml(code)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Can't reach this page</title>
<style>
  html, body { height: 100%; margin: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0f1115; color: #e6e9ef;
    display: flex; align-items: center; justify-content: center;
  }
  .card { max-width: 520px; padding: 0 32px; text-align: center; }
  .icon { font-size: 44px; color: #5b8cff; }
  h1 { font-size: 22px; margin: 14px 0 8px; }
  p { color: #8b93a3; line-height: 1.5; margin: 6px 0; }
  .url { color: #c3cad8; word-break: break-all; }
  .code { color: #6a7282; font-size: 12px; margin-top: 14px; }
  a.retry {
    display: inline-block; margin-top: 22px; padding: 10px 22px;
    background: #5b8cff; color: #fff; text-decoration: none; border-radius: 20px;
    font-size: 14px;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">◐</div>
    <h1>Can't reach this page</h1>
    <p class="url">${safeUrl}</p>
    <p>${safeDesc}</p>
    ${originalUrl ? `<a class="retry" href="${safeUrl}">Try again</a>` : ''}
    <p class="code">${safeCode}</p>
  </div>
</body>
</html>`
}
