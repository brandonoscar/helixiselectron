# Helixis

A minimal tabbed web browser built on Electron (`BaseWindow` + `WebContentsView`).
No browser fork — a thin shell around Chromium via Electron.

## Architecture

```
BaseWindow
├── chrome  WebContentsView  → React UI (tab strip + toolbar), spans whole window
└── tab[]   WebContentsView  → web content, layered over the region below the chrome
```

- **`BaseWindow` + `WebContentsView`** — the modern replacement for the
  deprecated `BrowserView` (Electron 30+). The React "chrome" view renders the
  tab strip and toolbar and leaves a hole; the main process layers the active
  tab's native view over that hole and keeps bounds in sync on resize.
- **Helixis-branded new-tab page** — served from a custom `helixis://newtab`
  scheme (`src/main/newtab.ts`), with a search box. The default search engine is
  one constant, `SEARCH_URL` in `src/shared/layout.ts`. Protocol handlers are
  registered per-session, so the handler is bound to the tabs' partition.
- **Persistent session** — a single `persist:` partition so cookies/localStorage
  survive restarts and sites stay logged in. (`src/main/sessions.ts`)
- **OAuth safety** — `accounts.google.com` window-opens are routed to the system
  browser via `shell.openExternal`, since Google blocks embedded webviews.
- **CDP enabled** in dev (`--remote-debugging-port 9222`) for future tooling.
  Toggle with `HELIXIS_CDP=0` / `HELIXIS_CDP_PORT=<port>`.

## Project layout

```
src/
  shared/     types + layout constants shared across processes
  main/       Electron main process
    index.ts        app bootstrap, BaseWindow + chrome view, opens a home tab
    TabManager.ts   WebContentsView-per-tab manager, layout, z-order
    sessions.ts     persistent session partition
    ipc.ts          IPC handlers
  preload/    contextBridge → window.helixis
  renderer/   React UI (tab strip + toolbar)
```

## Develop

```bash
npm install
npm run dev          # launch the browser with HMR
npm run typecheck    # tsc for main/preload + renderer
npm run build        # bundle main + preload + renderer to out/
npm run package      # build + electron-builder installers
```

> Running the GUI requires a desktop/display. In headless CI you can still
> `npm run typecheck` and `npm run build`.

## Features

- Multiple tabs (open, close, switch) with favicons + per-tab loading spinner.
- Back / forward / reload + an address bar that accepts URLs, bare hostnames, or
  search terms.
- **Application menu + keyboard shortcuts**: new/close/reopen tab, reload/force
  reload, find, zoom in/out/reset, back/forward, next/previous tab, focus
  address bar (Cmd/Ctrl+L), devtools, fullscreen.
- **Right-click context menus** for links, images, editable fields, and text
  selections, plus back/forward/reload and inspect.
- **Find in page** (Cmd/Ctrl+F) with match count and next/previous.
- **Downloads** to the OS Downloads folder, with a progress popover and
  open/show-in-folder.
- **Permission prompts** for camera/mic/location/notifications (remembered per
  origin).
- **Error pages** for failed loads (keeps the original URL in the address bar).
- **Window-state + session restore**: window size and open tabs return on next
  launch.
- **History + address-bar autocomplete**, **bookmarks** (star + popover), and a
  **settings** panel (search engine, startup page, clear data, default browser).
- **Multiple windows** and **private windows** (ephemeral, non-persistent
  session), **single-instance** focus, **print / save-as-PDF**, and spellcheck.
- `target=_blank` / `window.open` open as new tabs; Google OAuth opens in the
  system browser. Logins persist across restarts.
