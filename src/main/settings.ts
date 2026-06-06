import { readJSON, writeJSON } from './store'
import { NEWTAB_URL } from '../shared/layout'
import type { Settings, SearchEngine } from '../shared/types'

export const SEARCH_ENGINES: SearchEngine[] = [
  { id: 'google', name: 'Google', url: 'https://www.google.com/search' },
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search' },
  { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/' },
  { id: 'brave', name: 'Brave', url: 'https://search.brave.com/search' }
]

const SETTINGS_FILE = 'settings.json'

const DEFAULTS: Settings = {
  searchEngine: 'google',
  homePage: NEWTAB_URL,
  restoreSession: true
}

let cache: Settings | null = null

export function getSettings(): Settings {
  if (!cache) cache = { ...DEFAULTS, ...readJSON<Partial<Settings>>(SETTINGS_FILE, {}) }
  return cache
}

export function setSettings(patch: Partial<Settings>): Settings {
  cache = { ...getSettings(), ...patch }
  writeJSON(SETTINGS_FILE, cache)
  return cache
}

/** Base search URL for the configured engine (falls back to Google). */
export function searchUrl(): string {
  const id = getSettings().searchEngine
  return (SEARCH_ENGINES.find((e) => e.id === id) ?? SEARCH_ENGINES[0]).url
}

/** Build a search results URL for a query using the configured engine. */
export function searchFor(query: string): string {
  return `${searchUrl()}?q=${encodeURIComponent(query)}`
}

/** Resolved startup/home URL. */
export function homeUrl(): string {
  const home = getSettings().homePage
  return home === NEWTAB_URL || !home ? NEWTAB_URL : home
}
