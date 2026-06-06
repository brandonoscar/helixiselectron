import { app, shell, type Session, type DownloadItem as NativeItem } from 'electron'
import { join } from 'node:path'
import type { DownloadItem } from '../shared/types'

/**
 * Tracks downloads for a session. Files save to the OS Downloads folder without
 * a save dialog; progress and completion are pushed to the chrome UI.
 */
export class DownloadManager {
  private items = new Map<string, { rec: DownloadItem; native: NativeItem }>()
  private order: string[] = []
  private notify: (items: DownloadItem[]) => void

  constructor(session: Session, notify: (items: DownloadItem[]) => void) {
    this.notify = notify
    session.on('will-download', (_e, item) => this.track(item))
  }

  private track(item: NativeItem): void {
    const id = `dl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const savePath = join(app.getPath('downloads'), item.getFilename())
    item.setSavePath(savePath)

    const rec: DownloadItem = {
      id,
      filename: item.getFilename(),
      url: item.getURL(),
      status: 'progressing',
      received: 0,
      total: item.getTotalBytes(),
      savePath
    }
    this.items.set(id, { rec, native: item })
    this.order.push(id)

    item.on('updated', (_e, state) => {
      rec.received = item.getReceivedBytes()
      rec.total = item.getTotalBytes()
      rec.status = state === 'interrupted' ? 'interrupted' : 'progressing'
      this.emit()
    })
    item.on('done', (_e, state) => {
      rec.status =
        state === 'completed' ? 'completed' : state === 'cancelled' ? 'cancelled' : 'interrupted'
      rec.received = item.getReceivedBytes()
      this.emit()
    })
    this.emit()
  }

  list(): DownloadItem[] {
    return this.order.map((id) => this.items.get(id)!.rec)
  }

  open(id: string): void {
    const it = this.items.get(id)
    if (it && it.rec.status === 'completed') shell.openPath(it.rec.savePath)
  }

  showInFolder(id: string): void {
    const it = this.items.get(id)
    if (it) shell.showItemInFolder(it.rec.savePath)
  }

  cancel(id: string): void {
    this.items.get(id)?.native.cancel()
  }

  /** Remove finished entries from the list (keeps in-progress ones). */
  clear(): void {
    for (const id of [...this.order]) {
      if (this.items.get(id)!.rec.status !== 'progressing') this.items.delete(id)
    }
    this.order = this.order.filter((id) => this.items.has(id))
    this.emit()
  }

  private emit(): void {
    this.notify(this.list())
  }
}
