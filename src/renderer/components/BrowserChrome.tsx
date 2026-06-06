import { useEffect, useRef, useState } from 'react'
import type { FindResult, ShellState, Suggestion } from '../../shared/types'
import { HOME_URL, NEWTAB_URL } from '../../shared/layout'
import { FindBar } from './FindBar'
import { DownloadsPanel } from './DownloadsPanel'
import { SettingsPanel } from './SettingsPanel'
import { Bookmarks } from './Bookmarks'

interface SuggestRow {
  url: string
  primary: string
  secondary: string
}

export function BrowserChrome({ state }: { state: ShellState }): JSX.Element {
  const activeTab = state.tabs.find((t) => t.id === state.activeTabId) ?? null

  const [urlDraft, setUrlDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [selIndex, setSelIndex] = useState(-1)
  const [findOpen, setFindOpen] = useState(false)
  const [findResult, setFindResult] = useState<FindResult | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const urlRef = useRef<HTMLInputElement>(null)

  // Keep the URL bar in sync with the active tab unless the user is typing.
  useEffect(() => {
    if (!editing) {
      const url = activeTab?.url ?? ''
      const isNewTab = url === NEWTAB_URL || url === `${NEWTAB_URL}/`
      setUrlDraft(isNewTab ? '' : url)
    }
  }, [activeTab?.url, activeTab?.id, editing])

  // Raise the chrome above the page while editing so the suggestions dropdown is
  // visible and clickable over the content area.
  useEffect(() => {
    window.helixis.setOverlay(editing)
  }, [editing])

  useEffect(() => {
    const offFocus = window.helixis.onFocusAddressBar(() => {
      urlRef.current?.focus()
      urlRef.current?.select()
    })
    const offToggle = window.helixis.onToggleFind(() => setFindOpen((v) => !v))
    const offResult = window.helixis.onFindResult((r) => setFindResult(r))
    return () => {
      offFocus()
      offToggle()
      offResult()
    }
  }, [])

  useEffect(() => {
    setFindOpen(false)
    setFindResult(null)
    window.helixis.tabs.stopFind()
  }, [activeTab?.id])

  const closeFind = () => {
    setFindOpen(false)
    setFindResult(null)
    window.helixis.tabs.stopFind()
  }

  const onUrlChange = (value: string) => {
    setUrlDraft(value)
    setSelIndex(-1)
    if (value.trim()) window.helixis.history.query(value).then(setSuggestions)
    else setSuggestions([])
  }

  const rows: SuggestRow[] = urlDraft.trim()
    ? [
        { url: urlDraft, primary: `Search for “${urlDraft}”`, secondary: '' },
        ...suggestions.map((s) => ({ url: s.url, primary: s.title, secondary: s.url }))
      ]
    : []

  const go = (url: string) => {
    if (!activeTab) window.helixis.tabs.create({ url })
    else window.helixis.tabs.navigate(activeTab.id, url)
    setEditing(false)
    setSuggestions([])
    setSelIndex(-1)
    urlRef.current?.blur()
  }

  const onUrlKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      go(selIndex >= 0 ? rows[selIndex].url : urlDraft)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelIndex((i) => Math.min(i + 1, rows.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelIndex((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Escape') {
      e.preventDefault()
      urlRef.current?.blur()
    }
  }

  return (
    <div className="chrome">
      <div className="tabstrip">
        {state.tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab ${tab.id === state.activeTabId ? 'active' : ''}`}
            onClick={() => window.helixis.tabs.activate(tab.id)}
            title={tab.url}
          >
            <span className="tab-favicon">
              {tab.isLoading ? (
                <span className="spinner" />
              ) : tab.favicon ? (
                <img src={tab.favicon} alt="" />
              ) : (
                <span className="favicon-dot" />
              )}
            </span>
            <span className="tab-title">{tab.title || 'New tab'}</span>
            <button
              className="tab-close"
              title="Close tab"
              onClick={(e) => {
                e.stopPropagation()
                window.helixis.tabs.close(tab.id)
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          className="tab-new"
          title="New tab"
          onClick={() => window.helixis.tabs.create({ url: HOME_URL })}
        >
          +
        </button>
      </div>

      <div className="toolbar">
        <button
          className="nav-btn"
          title="Back"
          disabled={!activeTab?.canGoBack}
          onClick={() => activeTab && window.helixis.tabs.goBack(activeTab.id)}
        >
          ‹
        </button>
        <button
          className="nav-btn"
          title="Forward"
          disabled={!activeTab?.canGoForward}
          onClick={() => activeTab && window.helixis.tabs.goForward(activeTab.id)}
        >
          ›
        </button>
        <button
          className="nav-btn"
          title="Reload"
          disabled={!activeTab}
          onClick={() => activeTab && window.helixis.tabs.reload(activeTab.id)}
        >
          ⟳
        </button>
        <div className="urlform">
          <input
            ref={urlRef}
            className="urlbar"
            value={urlDraft}
            placeholder="Search or enter address"
            spellCheck={false}
            onChange={(e) => onUrlChange(e.target.value)}
            onKeyDown={onUrlKeyDown}
            onFocus={(e) => {
              setEditing(true)
              e.target.select()
            }}
            onBlur={() => setEditing(false)}
          />
          {editing && rows.length > 0 && (
            <ul className="url-suggest">
              {rows.map((row, i) => (
                <li
                  key={`${row.url}-${i}`}
                  className={i === selIndex ? 'sel' : ''}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => go(row.url)}
                >
                  <span className="sugg-primary">{row.primary}</span>
                  {row.secondary && <span className="sugg-secondary">{row.secondary}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <Bookmarks url={activeTab?.url ?? ''} title={activeTab?.title ?? ''} />
        {findOpen && <FindBar result={findResult} onClose={closeFind} />}
        <DownloadsPanel />
        <button className="nav-btn" title="Settings" onClick={() => setSettingsOpen(true)}>
          ⚙
        </button>
      </div>

      {activeTab?.isLoading && <div className="loadbar" />}
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
