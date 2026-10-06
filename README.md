# Occupella

A minimal tabbed web browser built on Electron (`BaseWindow` + `WebContentsView`).
No browser fork — a thin shell around Chromium via Electron.

## Architecture

```
BaseWindow
├── chrome   WebContentsView → React UI (tab strip + toolbar), app://chrome, default session
├── tab[]    WebContentsView → web content, persist:helixis-default (or a private session)
└── copilot  WebContentsView → Occupella Copilot panel, app://copilot, persist:occupella (lazy, Cmd/Ctrl+E)
```

### The copilot is the Chrome extension, bundled

`resources/copilot/` is the helixis-sidebar extension panel, copied unchanged
by `node scripts/sync-copilot.mjs ../helixis-sidebar` (the commit it came from
is in `resources/copilot/SOURCE`). Only `platform.js` is desktop-owned: it
swaps `chrome.*` for `window.occupellaDesktop`, a four-call bridge from
`src/preload/copilot.ts`:

| Call | Main-process side |
|---|---|
| `http` | `copilotNet.ts`: fetch run by main, streamed back. Reaches only the backend and the Supabase auth API (the backend's CORS list doesn't name `app://copilot`). |
| `pageContext` | `copilotIpc.ts`: Readability text of this window's active tab. Never a PMS screen (`contextPolicy.ts`) or a private window. |
| `setPendingApprovals` / `notifyApproval` | `approvals.ts`: dock/taskbar badge, native notification while the window is in the background. Approving only happens on the card. |

Change panel behaviour in helixis-sidebar, then re-sync. Never edit the copied
files here.

### Security posture

- Every view: `sandbox`, `contextIsolation`, no Node (a test fails on any
  `WebContentsView` without `sandbox: true`).
- App UI is served over `app://` with a CSP, never `file://`.
- IPC: chrome channels (`ipc.ts`) and copilot channels (`copilotIpc.ts`) each
  check the sender's identity, top-level frame and URL. Tests walk both files'
  syntax trees and fail on an unguarded `ipcMain.handle`.
- Permissions: allow / ask / deny lists; anything unlisted is denied
  (`permissions.ts`). App pages get no permissions beyond clipboard write.
- Fuses (electron-builder.yml): RunAsNode, NODE_OPTIONS, `--inspect` and
  file:// privileges off; cookie encryption and ASAR integrity on. CI reads
  them back from a packaged build (`scripts/check-fuses.mjs`).

- **`BaseWindow` + `WebContentsView`** — the modern replacement for the
  deprecated `BrowserView` (Electron 30+). The React "chrome" view renders the
  tab strip and toolbar and leaves a hole; the main process layers the active
  tab's native view over that hole and keeps bounds in sync on resize.
- **Occupella-branded new-tab page** — served from a custom `helixis://newtab`
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
    ipc.ts          IPC handlers (chrome)
    copilot.ts      the docked copilot view; copilotIpc.ts / copilotNet.ts / approvals.ts behind it
    appProtocol.ts  app:// file server for the chrome and copilot
  preload/    index.ts → window.helixis (chrome) · copilot.ts → window.occupellaDesktop
  renderer/   React UI (tab strip + toolbar)
resources/copilot/  the helixis-sidebar panel, bundled (see below)
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
- **Occupella Copilot** (Cmd/Ctrl+E): the extension's chat, approval cards,
  reminders and page context, with a badge and notification for approvals
  waiting on you.
