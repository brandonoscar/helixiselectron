import { useEffect, useState } from 'react'
import type { SearchEngine, Settings } from '../../shared/types'
import { NEWTAB_URL } from '../../shared/layout'

export function SettingsPanel({ onClose }: { onClose: () => void }): JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [engines, setEngines] = useState<SearchEngine[]>([])
  const [homeMode, setHomeMode] = useState<'newtab' | 'url'>('newtab')
  const [homeUrl, setHomeUrl] = useState('')
  const [cleared, setCleared] = useState(false)
  const [isDefault, setIsDefault] = useState(false)

  useEffect(() => {
    window.helixis.settings.get().then((s) => {
      setSettings(s)
      const isNewTab = s.homePage === NEWTAB_URL || !s.homePage
      setHomeMode(isNewTab ? 'newtab' : 'url')
      setHomeUrl(isNewTab ? '' : s.homePage)
    })
    window.helixis.settings.engines().then(setEngines)
    window.helixis.settings.isDefaultBrowser().then(setIsDefault)
    // Raise the chrome above the page so this modal is visible and clickable.
    window.helixis.setOverlay(true)
    return () => {
      window.helixis.setOverlay(false)
    }
  }, [])

  const patch = async (p: Partial<Settings>) => {
    const next = await window.helixis.settings.set(p)
    setSettings(next)
  }

  const saveHome = () => {
    patch({ homePage: homeMode === 'newtab' ? NEWTAB_URL : homeUrl.trim() || NEWTAB_URL })
  }

  const clearData = async () => {
    await window.helixis.settings.clearData()
    setCleared(true)
    setTimeout(() => setCleared(false), 2500)
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="settings" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <h2>Settings</h2>
          <button className="nav-btn" onClick={onClose} title="Close">
            ×
          </button>
        </div>

        {settings && (
          <>
            <section className="setting">
              <label>Search engine</label>
              <select
                value={settings.searchEngine}
                onChange={(e) => patch({ searchEngine: e.target.value })}
              >
                {engines.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </section>

            <section className="setting">
              <label>On startup</label>
              <div className="radio-row">
                <label className="radio">
                  <input
                    type="radio"
                    checked={homeMode === 'newtab'}
                    onChange={() => {
                      setHomeMode('newtab')
                      patch({ homePage: NEWTAB_URL })
                    }}
                  />
                  Open the New Tab page
                </label>
                <label className="radio">
                  <input
                    type="radio"
                    checked={homeMode === 'url'}
                    onChange={() => setHomeMode('url')}
                  />
                  Open a specific page
                </label>
                {homeMode === 'url' && (
                  <input
                    className="settings-input"
                    placeholder="https://example.com"
                    value={homeUrl}
                    onChange={(e) => setHomeUrl(e.target.value)}
                    onBlur={saveHome}
                  />
                )}
              </div>
            </section>

            <section className="setting">
              <label className="radio">
                <input
                  type="checkbox"
                  checked={settings.restoreSession}
                  onChange={(e) => patch({ restoreSession: e.target.checked })}
                />
                Reopen tabs from last session
              </label>
            </section>

            <section className="setting">
              <label>Default browser</label>
              {isDefault ? (
                <span className="settings-note">Occupella is your default browser.</span>
              ) : (
                <button
                  className="settings-btn"
                  onClick={async () => setIsDefault(await window.helixis.settings.makeDefaultBrowser())}
                >
                  Make Occupella the default browser
                </button>
              )}
            </section>

            <section className="setting">
              <label>Privacy</label>
              <button className="settings-btn" onClick={clearData}>
                Clear browsing data
              </button>
              {cleared && <span className="settings-note">Cleared.</span>}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
