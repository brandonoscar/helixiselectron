import { contextBridge, ipcRenderer } from 'electron'

/**
 * Preload for the copilot panel (app://copilot) only. Exposes
 * window.occupellaDesktop: the four things resources/copilot/platform.js
 * needs, and nothing of the browser chrome's window.helixis (tabs, history,
 * settings, downloads). The main process re-checks every call's sender
 * (src/main/copilotIpc.ts), so this list is a convenience, not the guard.
 */

interface StreamHandlers {
  chunk(bytes: Uint8Array): void
  end(): void
  error(message: string): void
}

// Body chunks for bridged requests, routed by request id. Handlers are
// registered before the request starts, so no chunk can arrive unclaimed.
const streams = new Map<string, StreamHandlers>()

ipcRenderer.on('copilot:http:chunk', (_e, id: string, bytes: Uint8Array) => {
  streams.get(id)?.chunk(bytes)
})
ipcRenderer.on('copilot:http:end', (_e, id: string) => {
  streams.get(id)?.end()
  streams.delete(id)
})
ipcRenderer.on('copilot:http:error', (_e, id: string, message: string) => {
  streams.get(id)?.error(message)
  streams.delete(id)
})

contextBridge.exposeInMainWorld('occupellaDesktop', {
  http: {
    start: (req: { id: string }, handlers: StreamHandlers) => {
      streams.set(req.id, handlers)
      return ipcRenderer.invoke('copilot:http:start', req).catch((err: unknown) => {
        streams.delete(req.id)
        throw err
      })
    },
    abort: (id: string) => {
      streams.delete(id)
      return ipcRenderer.invoke('copilot:http:abort', id)
    }
  },
  pageContext: () => ipcRenderer.invoke('copilot:pageContext'),
  setPendingApprovals: (count: number) => ipcRenderer.invoke('copilot:setPendingApprovals', count),
  notifyApproval: (approval: { id: string; title: string }) =>
    ipcRenderer.invoke('copilot:notifyApproval', approval)
})
