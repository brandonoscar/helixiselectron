import { useEffect, useState } from 'react'
import type { DownloadItem } from '../../shared/types'

function formatBytes(n: number): string {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`
}

export function DownloadsPanel(): JSX.Element | null {
  const [items, setItems] = useState<DownloadItem[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    window.helixis.downloads.list().then(setItems)
    return window.helixis.onDownloads((list) => {
      setItems(list)
      if (list.some((d) => d.status === 'progressing')) setOpen(true)
    })
  }, [])

  if (items.length === 0) return null

  const active = items.filter((d) => d.status === 'progressing').length

  return (
    <div className="downloads">
      <button
        className="nav-btn downloads-btn"
        title="Downloads"
        onClick={() => setOpen((v) => !v)}
      >
        ⤓{active > 0 && <span className="downloads-badge">{active}</span>}
      </button>
      {open && (
        <div className="downloads-pop">
          <div className="downloads-head">
            <span>Downloads</span>
            <button className="link-btn" onClick={() => window.helixis.downloads.clear()}>
              Clear
            </button>
          </div>
          {items.length === 0 && <p className="downloads-empty">No downloads</p>}
          {[...items].reverse().map((d) => {
            const pct = d.total > 0 ? Math.round((d.received / d.total) * 100) : 0
            return (
              <div key={d.id} className="download-row">
                <div className="download-name" title={d.filename}>
                  {d.filename}
                </div>
                {d.status === 'progressing' ? (
                  <>
                    <div className="download-progress">
                      <div className="download-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="download-meta">
                      <span>
                        {formatBytes(d.received)}
                        {d.total > 0 ? ` / ${formatBytes(d.total)}` : ''}
                      </span>
                      <button className="link-btn" onClick={() => window.helixis.downloads.cancel(d.id)}>
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="download-meta">
                    <span className={`download-status ${d.status}`}>
                      {d.status === 'completed' ? formatBytes(d.received) : d.status}
                    </span>
                    <span className="download-actions">
                      {d.status === 'completed' && (
                        <button className="link-btn" onClick={() => window.helixis.downloads.open(d.id)}>
                          Open
                        </button>
                      )}
                      <button
                        className="link-btn"
                        onClick={() => window.helixis.downloads.showInFolder(d.id)}
                      >
                        Show
                      </button>
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
