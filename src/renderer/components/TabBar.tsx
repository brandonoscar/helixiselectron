import { useEffect, useState } from 'react'
import type { ShellState, TabState } from '../../shared/types'

export function TabBar({
  state,
  activeTab
}: {
  state: ShellState
  activeTab: TabState | null
}): JSX.Element {
  const [urlDraft, setUrlDraft] = useState('')
  const [editing, setEditing] = useState(false)

  // Keep the URL bar in sync with the active tab unless the user is typing.
  useEffect(() => {
    if (!editing) setUrlDraft(activeTab?.url ?? '')
  }, [activeTab?.url, activeTab?.id, editing])

  const submitUrl = (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeTab) return
    window.helixis.tabs.navigate(activeTab.id, urlDraft)
    setEditing(false)
  }

  return (
    <div className="tabbar">
      <div className="tabstrip">
        {state.tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab ${tab.id === state.activeTabId ? 'active' : ''}`}
            onClick={() => window.helixis.tabs.activate(tab.id)}
            title={tab.url}
          >
            <span className="tab-title">
              {tab.isLoading ? '…' : ''}
              {tab.title || 'New tab'}
            </span>
            <button
              className="tab-close"
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
          onClick={() => window.helixis.tabs.create({ url: 'https://www.google.com' })}
        >
          +
        </button>
      </div>

      <div className="navbar">
        <button
          disabled={!activeTab?.canGoBack}
          onClick={() => activeTab && window.helixis.tabs.goBack(activeTab.id)}
        >
          ‹
        </button>
        <button
          disabled={!activeTab?.canGoForward}
          onClick={() => activeTab && window.helixis.tabs.goForward(activeTab.id)}
        >
          ›
        </button>
        <button
          disabled={!activeTab}
          onClick={() => activeTab && window.helixis.tabs.reload(activeTab.id)}
        >
          ⟳
        </button>
        <form className="urlform" onSubmit={submitUrl}>
          <input
            className="urlbar"
            value={urlDraft}
            placeholder="Search or enter address"
            disabled={!activeTab}
            onChange={(e) => setUrlDraft(e.target.value)}
            onFocus={() => setEditing(true)}
            onBlur={() => setEditing(false)}
          />
        </form>
      </div>
    </div>
  )
}
