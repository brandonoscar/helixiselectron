import { useEffect, useRef, useState } from 'react'
import type { FindResult } from '../../shared/types'

export function FindBar({
  result,
  onClose
}: {
  result: FindResult | null
  onClose: () => void
}): JSX.Element {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const run = (findNext: boolean, forward = true) => {
    if (text) window.helixis.tabs.find(text, { findNext, forward })
    else window.helixis.tabs.stopFind()
  }

  const onChange = (value: string) => {
    setText(value)
    if (value) window.helixis.tabs.find(value, { findNext: false })
    else window.helixis.tabs.stopFind()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      run(true, !e.shiftKey)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  const count = text && result ? `${result.active}/${result.matches}` : ''

  return (
    <div className="findbar">
      <input
        ref={inputRef}
        className="find-input"
        value={text}
        placeholder="Find in page"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <span className="find-count">{count}</span>
      <button className="find-btn" title="Previous (Shift+Enter)" onClick={() => run(true, false)}>
        ‹
      </button>
      <button className="find-btn" title="Next (Enter)" onClick={() => run(true, true)}>
        ›
      </button>
      <button className="find-btn" title="Close (Esc)" onClick={onClose}>
        ×
      </button>
    </div>
  )
}
