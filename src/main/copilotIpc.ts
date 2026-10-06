import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { CopilotPanel, COPILOT_HOST } from './copilot'
import { isAppUrl } from './appProtocol'
import { parseHttpRequest } from './copilotNet'
import { contextAllowed } from './contextPolicy'
import { extractReadable } from './readable'
import { controllerForCopilot } from './windows'
import type { PageContext } from '../shared/types'

export type PageContextResult =
  | { ok: true; page: PageContext }
  | { ok: false; reason: 'blocked' | 'private' | 'none' }

/**
 * Resolve the copilot panel behind an IPC call, or null to refuse it. All
 * three must hold: the sender is a copilot view this process created (by
 * identity, not by URL), the call comes from its top-level frame, and that
 * frame is showing the bundled panel. A copilot view navigated anywhere else
 * (it cannot be, see copilot.ts, but if it were) loses the bridge.
 */
function copilotFor(e: IpcMainInvokeEvent): CopilotPanel | null {
  const panel = CopilotPanel.fromWebContents(e.sender)
  const frame = e.senderFrame
  if (!panel || !frame || frame.parent !== null) return null
  return isAppUrl(frame.url, COPILOT_HOST) ? panel : null
}

/**
 * Register a copilot-only channel. Every copilot channel goes through here;
 * copilotIpc.test.ts walks this file's syntax tree and fails on any
 * ipcMain.handle call outside this function.
 */
function handleCopilot(
  channel: string,
  handler: (panel: CopilotPanel, e: IpcMainInvokeEvent, arg: unknown) => unknown
): void {
  ipcMain.handle(channel, (e, arg: unknown) => {
    const panel = copilotFor(e)
    if (!panel) {
      console.warn(`ipc: blocked '${channel}' from non-copilot sender ${e.senderFrame?.url ?? '(gone)'}`)
      throw new Error('Not allowed')
    }
    return handler(panel, e, arg)
  })
}

export function registerCopilotIpc(): void {
  handleCopilot('copilot:http:start', (panel, e, arg) => {
    const req = parseHttpRequest(arg)
    if (!req) throw new Error('Request refused: only the Occupella backend and its auth service are reachable')
    return panel.net.start(e.sender, req)
  })

  handleCopilot('copilot:http:abort', (panel, _e, id) => {
    if (typeof id === 'string') panel.net.abort(id)
  })

  // The active tab of the window this panel is docked in. The page policy is
  // checked on the URL BEFORE anything runs in the tab.
  handleCopilot('copilot:pageContext', async (panel): Promise<PageContextResult> => {
    const controller = controllerForCopilot(panel)
    if (!controller) return { ok: false, reason: 'none' }
    if (controller.incognito) return { ok: false, reason: 'private' }
    const wc = controller.tabManager.activeWebContents()
    if (!wc) return { ok: false, reason: 'none' }
    if (!contextAllowed(wc.getURL())) return { ok: false, reason: 'blocked' }
    const page = await extractReadable(wc)
    // The tab may have navigated while the page was being read. Re-check, and
    // drop the text (it never leaves this process) if it landed on a PMS.
    if (page && !(contextAllowed(wc.getURL()) && contextAllowed(page.url))) {
      return { ok: false, reason: 'blocked' }
    }
    return page ? { ok: true, page } : { ok: false, reason: 'none' }
  })

  handleCopilot('copilot:setPendingApprovals', (panel, _e, count) => {
    if (typeof count === 'number' && Number.isInteger(count) && count >= 0 && count < 1000) {
      panel.alerts.setPending(count)
    }
  })

  handleCopilot('copilot:notifyApproval', (panel, _e, arg) => {
    const a = arg as { id?: unknown; title?: unknown } | null
    if (typeof a?.id !== 'string' || typeof a?.title !== 'string') return
    panel.alerts.notify(a.id.slice(0, 200), a.title.slice(0, 200))
  })
}
