// Occupella Copilot — platform seam (desktop browser host).
//
// The desktop copy of helixis-sidebar/platform.js: same exports, same
// shapes, backed by window.occupellaDesktop (src/preload/copilot.ts) instead
// of chrome.*. scripts/sync-copilot.mjs never overwrites this file; every
// other file in this folder is copied from the extension unchanged.

const bridge = window.occupellaDesktop;

export const host = 'desktop';

/**
 * Key/value persistence. Plain localStorage is enough: this page runs in its
 * own persist:occupella partition, which no website or browser tab shares.
 * Values are JSON-encoded so they round-trip like chrome.storage.local.
 */
export const storage = {
  async get(keys) {
    const out = {};
    for (const k of toList(keys)) {
      const raw = localStorage.getItem(k);
      if (raw === null) continue;
      try { out[k] = JSON.parse(raw); } catch { /* corrupt entry: treat as absent */ }
    }
    return out;
  },
  async set(patch) {
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) localStorage.removeItem(k);
      else localStorage.setItem(k, JSON.stringify(v));
    }
  },
  async remove(keys) {
    for (const k of toList(keys)) localStorage.removeItem(k);
  },
};

function toList(keys) {
  return typeof keys === 'string' ? [keys] : Array.from(keys ?? []);
}

// Statuses whose Response must not carry a body (the constructor throws).
const NULL_BODY = new Set([101, 103, 204, 205, 304]);

/**
 * fetch(), run by the main process. The backend's CORS list names its web
 * origins, not this app://copilot page, and an extension page is exempt from
 * CORS where this one is not. Main forwards to the backend and Supabase only
 * (src/main/copilotNet.ts) and streams the body back, so SSE still streams.
 */
export function http(url, init = {}) {
  const signal = init.signal;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }

    const id = crypto.randomUUID();
    let ctrl;
    const body = new ReadableStream({ start(c) { ctrl = c; } });
    const safely = (fn) => { try { fn(); } catch { /* stream already closed */ } };
    const onAbort = () => {
      bridge.http.abort(id);
      safely(() => ctrl.error(abortError()));
      reject(abortError()); // no-op once the head has resolved
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    const settle = () => signal?.removeEventListener('abort', onAbort);

    bridge.http
      .start(
        {
          id,
          url: String(url),
          method: init.method || 'GET',
          headers: Object.fromEntries(new Headers(init.headers ?? {})),
          body: typeof init.body === 'string' ? init.body : undefined,
        },
        {
          chunk: (bytes) => safely(() => ctrl.enqueue(bytes)),
          end: () => { settle(); safely(() => ctrl.close()); },
          error: (message) => { settle(); safely(() => ctrl.error(new TypeError(message))); },
        }
      )
      .then(
        (head) => resolve(new Response(NULL_BODY.has(head.status) ? null : body, head)),
        (err) => { settle(); reject(new TypeError(err?.message || 'Network request failed')); }
      );
  });
}

function abortError() {
  return new DOMException('The operation was aborted.', 'AbortError');
}

/**
 * Read the active browser tab: {url, title, text}. The main process checks
 * the same page policy before it reads anything; `allowed` is re-checked here
 * so both hosts behave the same.
 */
export async function captureActivePage(allowed) {
  const res = await bridge.pageContext();
  if (res.ok) {
    if (!allowed(res.page.url)) throw new ContextBlockedError();
    return res.page;
  }
  if (res.reason === 'blocked') throw new ContextBlockedError();
  if (res.reason === 'private') throw new ContextBlockedError('Private windows are not shared with the copilot.');
  throw new Error('No readable page in the active tab');
}

/** Same name as the extension's, so panel.js can recognise it. */
export class ContextBlockedError extends Error {
  constructor(message = 'Occupella does not read property-management system screens. Your PMS data reaches Occupella through its API connection.') {
    super(message);
    this.name = 'ContextBlockedError';
  }
}

/** Unresolved approval cards → dock/taskbar badge. */
export function setPendingApprovals(count) {
  bridge.setPendingApprovals(count);
}

/** A new approval card arrived → native notification when the window is in
 *  the background. Clicking it opens this panel; approving happens here. */
export function notifyApproval(approval) {
  bridge.notifyApproval({ id: String(approval.id), title: String(approval.title) });
}
