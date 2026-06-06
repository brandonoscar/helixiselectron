import { useEffect, useState } from 'react'
import type { Bookmark } from '../../shared/types'

export function Bookmarks({ url, title }: { url: string; title: string }): JSX.Element {
  const [items, setItems] = useState<Bookmark[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    window.helixis.bookmarks.list().then(setItems)
    return window.helixis.onBookmarks(setItems)
  }, [])

  // The list popover extends below the toolbar over the page.
  useEffect(() => {
    window.helixis.setOverlay(open)
  }, [open])

  const bookmarkable = /^https?:\/\//i.test(url)
  const starred = items.some((b) => b.url === url)

  return (
    <>
      <button
        className={`nav-btn ${starred ? 'starred' : ''}`}
        title={starred ? 'Remove bookmark' : 'Bookmark this page'}
        disabled={!bookmarkable}
        onClick={() => window.helixis.bookmarks.toggle(url, title)}
      >
        {starred ? '★' : '☆'}
      </button>
      <div className="bookmarks">
        <button className="nav-btn" title="Bookmarks" onClick={() => setOpen((v) => !v)}>
          ▾
        </button>
        {open && (
          <div className="bm-pop">
            <div className="bm-head">Bookmarks</div>
            {items.length === 0 && <p className="bm-empty">No bookmarks yet</p>}
            {items.map((b) => (
              <div key={b.url} className="bm-row">
                <button
                  className="bm-open"
                  title={b.url}
                  onClick={() => {
                    window.helixis.tabs.create({ url: b.url })
                    setOpen(false)
                  }}
                >
                  {b.title}
                </button>
                <button
                  className="bm-remove"
                  title="Remove"
                  onClick={() => window.helixis.bookmarks.remove(b.url)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
