import { app, nativeImage, Notification, type BaseWindow, type NativeImage } from 'electron'

/**
 * Pending-approval alerts for one window's copilot: a native notification
 * when an approval card arrives while the user is elsewhere, and a badge with
 * the count of cards still waiting (dock on macOS, taskbar overlay on
 * Windows, launcher count on Linux where the desktop supports it).
 *
 * Approving never happens from the notification. A click only brings the
 * window forward with the copilot open, because the card is where the
 * drafted payload is visible ("What will be sent").
 *
 * The count is what the panel has on screen, not server state: cards from a
 * chat turn this window has not seen are not counted.
 */
export class ApprovalAlerts {
  private count = 0
  private shown = new Map<string, Notification>()

  constructor(
    private window: BaseWindow,
    /** Bring the window forward with the copilot visible. */
    private reveal: () => void,
    /** Whether the user can see the copilot right now. */
    private copilotVisible: () => boolean
  ) {}

  setPending(count: number): void {
    this.count = count
    if (count === 0) this.closeAll()
    refreshBadge()
    if (process.platform === 'win32' && !this.window.isDestroyed()) {
      this.window.setOverlayIcon(
        count > 0 ? overlayDot() : null,
        count > 0 ? `${count} approval${count === 1 ? '' : 's'} waiting` : ''
      )
    }
  }

  pending(): number {
    return this.count
  }

  notify(id: string, title: string): void {
    if (this.window.isDestroyed()) return
    if (this.window.isFocused() && this.copilotVisible()) return
    if (this.shown.has(id) || !Notification.isSupported()) return
    const n = new Notification({ title: 'Approval needed', body: title })
    // Hold a reference until it closes: a garbage-collected Notification
    // loses its click handler.
    this.shown.set(id, n)
    n.on('click', () => this.reveal())
    n.on('close', () => this.shown.delete(id))
    n.show()
  }

  dispose(): void {
    this.closeAll()
    this.count = 0
    all.delete(this)
    refreshBadge()
  }

  private closeAll(): void {
    for (const n of this.shown.values()) n.close()
    this.shown.clear()
  }

  static create(window: BaseWindow, reveal: () => void, copilotVisible: () => boolean): ApprovalAlerts {
    const a = new ApprovalAlerts(window, reveal, copilotVisible)
    all.add(a)
    return a
  }
}

const all = new Set<ApprovalAlerts>()

/** The app badge is app-wide, so it shows the total across windows. */
function refreshBadge(): void {
  let total = 0
  for (const a of all) total += a.pending()
  app.setBadgeCount(total)
}

let dot: NativeImage | null = null

/** 16x16 amber dot for the Windows taskbar overlay, drawn in code so no
 *  icon asset has to ship. Pixels are BGRA, which createFromBitmap expects. */
function overlayDot(): NativeImage {
  if (dot) return dot
  const size = 16
  const buf = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - 7.5
      const dy = y - 7.5
      if (dx * dx + dy * dy <= 7.5 * 7.5) buf.set([0x06, 0x77, 0xd9, 0xff], (y * size + x) * 4)
    }
  }
  dot = nativeImage.createFromBitmap(buf, { width: size, height: size })
  return dot
}
