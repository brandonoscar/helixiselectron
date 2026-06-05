import { useEffect, useState } from 'react'
import type { ShellState } from '../shared/types'
import { BrowserChrome } from './components/BrowserChrome'

const EMPTY: ShellState = { tabs: [], activeTabId: null }

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

  return (
    <div className="app">
      <BrowserChrome state={state} />
      {/* The content region is intentionally empty: the native WebContentsView
          for the active tab is layered on top of this hole by the main process. */}
      <main className="content-region">
        {state.tabs.length === 0 && (
          <div className="content-empty">
            <p>No tab open — press + to open one.</p>
          </div>
        )}
      </main>
    </div>
  )
}
