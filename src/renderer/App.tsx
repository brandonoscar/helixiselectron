import { useEffect, useState } from 'react'
import type { ShellState } from '../shared/types'
import { Sidebar } from './components/Sidebar'
import { TabBar } from './components/TabBar'

const EMPTY: ShellState = {
  profiles: [],
  tabs: [],
  activeTabId: null,
  activeProfileId: 'default'
}

export function App(): JSX.Element {
  const [state, setState] = useState<ShellState>(EMPTY)

  useEffect(() => {
    let mounted = true
    window.helixis.getState().then((s) => {
      if (mounted) setState(s)
    })
    const unsubscribe = window.helixis.onStateChanged((s) => setState(s))
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  const activeTab = state.tabs.find((t) => t.id === state.activeTabId) ?? null

  return (
    <div className="app">
      <Sidebar state={state} />
      <TabBar state={state} activeTab={activeTab} />
      {/* The content region is intentionally empty: the native WebContentsView
          for the active tab is layered on top of this hole by the main process. */}
      <main className="content-region">
        {state.tabs.length === 0 && (
          <div className="content-empty">
            <h2>No tab open</h2>
            <p>Launch a workspace app from the sidebar to get started.</p>
          </div>
        )}
      </main>
    </div>
  )
}
