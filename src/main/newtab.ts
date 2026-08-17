// The Helixis new-tab / home page, served over the custom `helixis://newtab`
// scheme (see index.ts). Self-contained HTML so it ships inside the app with no
// external assets. The search box is a plain GET form (pointed at the user's
// configured search engine) so it works inside the sandboxed content view
// without any IPC.
export function newtabHTML(searchUrl: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Occupella</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: radial-gradient(1200px 600px at 50% -10%, #1b2030 0%, #0f1115 60%);
    color: #e6e9ef;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 28px;
  }
  .brand { display: flex; align-items: center; gap: 14px; }
  .mark { color: #5b8cff; font-size: 52px; line-height: 1; }
  .name { font-size: 48px; font-weight: 700; letter-spacing: -0.02em; }
  form { width: min(620px, 86vw); position: relative; }
  input {
    width: 100%;
    padding: 16px 20px;
    font-size: 16px;
    color: #e6e9ef;
    background: rgba(255,255,255,0.04);
    border: 1px solid #2a2f3a;
    border-radius: 28px;
    outline: none;
  }
  input::placeholder { color: #8b93a3; }
  input:focus { border-color: #5b8cff; background: rgba(91,140,255,0.06); }
  .tagline { color: #8b93a3; font-size: 13px; margin-top: -8px; }
</style>
</head>
<body>
  <div class="brand">
    <span class="mark">◐</span>
    <span class="name">Occupella</span>
  </div>
  <form action="${searchUrl}" method="GET" autocomplete="off">
    <input name="q" placeholder="Search the web" autofocus aria-label="Search" />
  </form>
  <div class="tagline">Search the web with Occupella</div>
</body>
</html>`
}
