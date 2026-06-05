import { useEffect, useState } from 'react'
import type { AppInfo, ShellState } from '../../shared/types'
import { QUICK_APPS } from '../apps'

export function Sidebar({ state }: { state: ShellState }): JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    window.helixis.app.info().then(setInfo)
  }, [])

  const openApp = (url: string) => {
    window.helixis.tabs.create({ url, activate: true })
  }

  const addProfile = async () => {
    const name = window.prompt('New workspace name (one per PM customer):')
    if (name) await window.helixis.profiles.create(name)
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">◐</span>
        <span className="brand-name">Helixis</span>
      </div>

      <section className="panel">
        <h3>Workspace apps</h3>
        <div className="app-grid">
          {QUICK_APPS.map((app) => (
            <button
              key={app.name}
              className="app-btn"
              title={app.hint}
              onClick={() => openApp(app.url)}
            >
              <span>{app.name}</span>
              {app.api && <span className="api-pill">API</span>}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Workspaces</h3>
          <button className="link-btn" onClick={addProfile}>
            + Add
          </button>
        </div>
        <ul className="profile-list">
          {state.profiles.map((p) => (
            <li
              key={p.id}
              className={p.id === state.activeProfileId ? 'active' : ''}
              onClick={() => window.helixis.profiles.activate(p.id)}
            >
              {p.name}
            </li>
          ))}
        </ul>
        <p className="hint">
          Each workspace is an isolated, persistent session — logins for one PM
          customer never leak into another.
        </p>
      </section>

      <section className="panel agent-panel">
        <h3>Agent</h3>
        <div className="agent-stub">
          <p>
            The execution layer (Playwright over CDP + agent loop) attaches here
            in Weeks 3-4.
          </p>
          <textarea
            className="agent-input"
            placeholder="e.g. open Buildium, find unit 4B, mark rent paid"
            disabled
          />
          <button className="agent-run" disabled>
            Run (coming soon)
          </button>
        </div>
      </section>

      {info && (
        <footer className="sidebar-foot">
          <span>
            Electron {info.electron} · Chromium {info.chrome.split('.')[0]}
          </span>
          <span>
            CDP: {info.cdpPort ? `:${info.cdpPort}` : 'off'}
          </span>
        </footer>
      )}
    </aside>
  )
}
