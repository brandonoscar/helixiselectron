export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Minimum visible overlap, in px each way, for a saved window position to
 *  count as on-screen: enough of the title bar to grab and drag. */
const MIN_VISIBLE = 100

/**
 * True when a saved window rectangle still overlaps one of the current
 * displays' work areas by at least MIN_VISIBLE px both ways. False after the
 * monitor it was on is unplugged, or a resolution change pushed it away.
 * Restoring such a position opens the window where nobody can see it.
 */
export function isOnScreen(bounds: Rect, workAreas: Rect[]): boolean {
  return workAreas.some((a) => {
    const w = Math.min(bounds.x + bounds.width, a.x + a.width) - Math.max(bounds.x, a.x)
    const h = Math.min(bounds.y + bounds.height, a.y + a.height) - Math.max(bounds.y, a.y)
    return w >= MIN_VISIBLE && h >= MIN_VISIBLE
  })
}
