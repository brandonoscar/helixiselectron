import { useEffect, useRef, useState } from 'react'
import type { FindResult, ShellState } from '../../shared/types'
import { HOME_URL, NEWTAB_URL } from '../../shared/layout'
import { FindBar } from './FindBar'
import { DownloadsPanel } from './DownloadsPanel'

export function BrowserChrome({ state }: { state: ShellState }): JSX.Element {
  const activeTab = state.tabs.find((t) => t.id === state.activeTabId) ?? null

  const [urlDraft, setUrlDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const [findResult, setFindResult] = useState<FindResult | null>(null)
  const urlRef = useRef<HTMLInputElement>(null)

  // Keep the URL bar in sync with the active tab unless the user is typing.
  // The internal new-tab URL is shown as an empty bar (placeholder), like a
  // real browser, rather than exposing "helixis://newtab".
  useEffect(() => {
    if (!editing) {
      const url = activeTab?.url ?? ''
      const isNewTab = url === NEWTAB_URL || url === `${NEWTAB_URL}/`
      setUrlDraft(isNewTab ? '' : url)
    }
  }, [activeTab?.url, activeTab?.id, editing])

  // Menu/shortcut driven: focus the address bar (Cmd/Ctrl+L), toggle find
  // (Cmd/Ctrl+F), and receive find results.
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

  // Close the find bar (and clear the highlight) when switching tabs.
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

  const submitUrl = (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeTab) {
      window.helixis.tabs.create({ url: urlDraft })
    } else {
      window.helixis.tabs.navigate(activeTab.id, urlDraft)
    }
    setEditing(false)
    urlRef.current?.blur()
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
        <form className="urlform" onSubmit={submitUrl}>
          <input
            ref={urlRef}
            className="urlbar"
            value={urlDraft}
            placeholder="Search or enter address"
            spellCheck={false}
            onChange={(e) => setUrlDraft(e.target.value)}
            onFocus={(e) => {
              setEditing(true)
              e.target.select()
            }}
            onBlur={() => setEditing(false)}
          />
        </form>
        {findOpen && <FindBar result={findResult} onClose={closeFind} />}
        <DownloadsPanel />
      </div>

      {activeTab?.isLoading && <div className="loadbar" />}
    </div>
  )
}
