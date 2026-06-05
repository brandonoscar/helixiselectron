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

- Multiple tabs (open, close, switch), with live title/loading state.
- Back / forward / reload + an address bar that accepts URLs, bare hostnames, or
  search terms.
- `target=_blank` / `window.open` open as new tabs.
- Logins persist across restarts.
