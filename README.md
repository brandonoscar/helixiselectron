# Helixis

AI-native browser shell for property managers — **Path C** from the architecture
decision report: a thin Electron shell that embeds web content, built so a
Playwright/CDP execution layer can attach later. No browser fork, no Chromium
rebase treadmill, all-permissive licenses.

This repository is the **Weeks 1–2 Foundation** deliverable: an installable
shell with a sidebar, tabbed embedded web content, and persistent per-workspace
sessions.

## Architecture

```
BaseWindow
├── chrome  WebContentsView  → React UI (sidebar + tab bar), spans whole window
└── tab[]   WebContentsView  → embedded web content, layered on top of the
                               content region (right of sidebar, below tab bar)
```

- **`BaseWindow` + `WebContentsView`** — the modern replacement for the
  deprecated `BrowserView` (Electron 30+). The React "chrome" view renders the
  sidebar and tab bar and leaves a hole; the main process layers the active
  tab's native view over that hole and keeps bounds in sync on resize.
- **Persistent per-workspace sessions** — each workspace (PM customer) maps to a
  `persist:helixis-<id>` partition, so cookies/localStorage survive restarts and
  one customer's logins never leak into another's. (`src/main/sessions.ts`)
- **CDP enabled** — the app starts with `--remote-debugging-port` (9222 in dev)
  so the Weeks 3–4 execution layer can attach via
  `chromium.connectOverCDP('http://localhost:9222')`. Toggle with
  `HELIXIS_CDP=0` / `HELIXIS_CDP_PORT=<port>`.
- **OAuth safety** — `accounts.google.com` window-opens are routed to the system
  browser via `shell.openExternal`, since Google blocks embedded webviews.

## Project layout

```
src/
  shared/     types + layout constants shared across processes
  main/       Electron main process
    index.ts        app bootstrap, BaseWindow + chrome view, CDP switch
    TabManager.ts   WebContentsView-per-tab manager, layout, z-order
    sessions.ts     persistent per-workspace session partitions
    ipc.ts          IPC handlers
  preload/    contextBridge → window.helixis
  renderer/   React UI (sidebar, tab bar)
```

## Develop

```bash
npm install
npm run dev          # launch the app with HMR
npm run typecheck    # tsc for main/preload + renderer
npm run build        # bundle main + preload + renderer to out/
npm run package      # build + electron-builder installers
```

> Running the GUI requires a desktop/display. In headless CI you can still
> `npm run typecheck` and `npm run build`.

## Roadmap (from the report's 90-day plan)

- **Weeks 1–2 — Foundation** ✅ this repo
- **Weeks 3–4 — Execution layer**: Playwright over CDP + thin action API
  (`click`/`fill`/`extract`/`navigate`/`snapshot_a11y_tree`) + agent loop.
- **Weeks 5–6 — Buildium API** (prefer API path, fall back to UI automation).
- **Weeks 7–8 — Gmail/Calendar** via official APIs + system-browser OAuth.
- **Weeks 9–10 — 3 named workflows + immutable audit log.**
- **Weeks 11–12 — RentManager API + design-partner onboarding.**
