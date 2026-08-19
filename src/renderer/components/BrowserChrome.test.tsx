import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserChrome } from './BrowserChrome'
import type { HelixisApi, ShellState } from '../../shared/types'

// The deployed Helixis app the logo/home button opens (mirrors BrowserChrome).
const HELIXIS_APP_URL = 'https://agentichelixis.vercel.app'

/** A full window.helixis stand-in so BrowserChrome (and its always-mounted
 *  children DownloadsPanel / Bookmarks) render without touching a real preload
 *  bridge. on*() handlers return an unsubscribe fn; everything else resolves. */
function makeHelixisMock(): HelixisApi {
  const sub = () => () => {}
  return {
    getState: vi.fn().mockResolvedValue({ tabs: [], activeTabId: null }),
    app: { info: vi.fn().mockResolvedValue({}) },
    copilot: { toggle: vi.fn().mockResolvedValue(undefined) },
    page: { context: vi.fn().mockResolvedValue(null) },
    tabs: {
      create: vi.fn().mockResolvedValue('tab-new'),
      close: vi.fn().mockResolvedValue(undefined),
      activate: vi.fn().mockResolvedValue(undefined),
      navigate: vi.fn().mockResolvedValue(undefined),
      goBack: vi.fn().mockResolvedValue(undefined),
      goForward: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
      find: vi.fn().mockResolvedValue(undefined),
      stopFind: vi.fn().mockResolvedValue(undefined)
    },
    downloads: {
      list: vi.fn().mockResolvedValue([]),
      open: vi.fn().mockResolvedValue(undefined),
      showInFolder: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined)
    },
    settings: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue({}),
      engines: vi.fn().mockResolvedValue([]),
      clearData: vi.fn().mockResolvedValue(undefined),
      isDefaultBrowser: vi.fn().mockResolvedValue(false),
      makeDefaultBrowser: vi.fn().mockResolvedValue(false)
    },
    history: { query: vi.fn().mockResolvedValue([]), clear: vi.fn().mockResolvedValue(undefined) },
    bookmarks: {
      list: vi.fn().mockResolvedValue([]),
      toggle: vi.fn().mockResolvedValue([]),
      remove: vi.fn().mockResolvedValue([])
    },
    onBookmarks: vi.fn(sub),
    setOverlay: vi.fn().mockResolvedValue(undefined),
    onStateChanged: vi.fn(sub),
    onDownloads: vi.fn(sub),
    onFocusAddressBar: vi.fn(sub),
    onToggleFind: vi.fn(sub),
    onFindResult: vi.fn(sub)
  } as unknown as HelixisApi
}

const EMPTY_STATE: ShellState = { tabs: [], activeTabId: null }

describe('BrowserChrome toolbar buttons', () => {
  beforeEach(() => {
    window.helixis = makeHelixisMock()
  })
  afterEach(() => cleanup())

  it('logo/home button opens the full Occupella app in a new tab', async () => {
    render(<BrowserChrome state={EMPTY_STATE} />)
    // findBy settles the always-mounted panels' async list() effects first.
    fireEvent.click(await screen.findByTitle('Occupella — open the app'))
    expect(window.helixis.tabs.create).toHaveBeenCalledTimes(1)
    expect(window.helixis.tabs.create).toHaveBeenCalledWith({ url: HELIXIS_APP_URL })
  })

  it('assistant button toggles the docked Copilot panel', async () => {
    render(<BrowserChrome state={EMPTY_STATE} />)
    fireEvent.click(await screen.findByTitle('Occupella Copilot (Cmd/Ctrl+E)'))
    expect(window.helixis.copilot.toggle).toHaveBeenCalledTimes(1)
  })

  it('assistant button does not open a tab, and the logo does not toggle the copilot', async () => {
    render(<BrowserChrome state={EMPTY_STATE} />)
    fireEvent.click(await screen.findByTitle('Occupella Copilot (Cmd/Ctrl+E)'))
    expect(window.helixis.tabs.create).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByTitle('Occupella — open the app'))
    expect(window.helixis.copilot.toggle).toHaveBeenCalledTimes(1)
  })
})
