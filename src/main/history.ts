import { readJSON, writeJSON, debounce } from './store'
import type { Suggestion } from '../shared/types'

interface HistoryEntry {
  url: string
  title: string
  ts: number
  visits: number
}

const FILE = 'history.json'
const MAX_ENTRIES = 3000

let entries: HistoryEntry[] | null = null

function load(): HistoryEntry[] {
  if (!entries) entries = readJSON<HistoryEntry[]>(FILE, [])
  return entries
}

const save = debounce(() => writeJSON(FILE, entries ?? []), 800)

export function recordVisit(url: string, title: string): void {
  if (!/^https?:\/\//i.test(url)) return // only real web pages
  const list = load()
  const existing = list.find((e) => e.url === url)
  if (existing) {
    existing.visits += 1
    existing.ts = Date.now()
    if (title) existing.title = title
  } else {
    list.unshift({ url, title: title || url, ts: Date.now(), visits: 1 })
    if (list.length > MAX_ENTRIES) list.length = MAX_ENTRIES
  }
  save()
}

export function updateTitle(url: string, title: string): void {
  if (!title) return
  const e = load().find((x) => x.url === url)
  if (e) {
    e.title = title
    save()
  }
}

export function query(text: string, limit = 6): Suggestion[] {
  const q = text.trim().toLowerCase()
  if (!q) return []
  return load()
    .filter((e) => e.url.toLowerCase().includes(q) || e.title.toLowerCase().includes(q))
    .sort((a, b) => score(b, q) - score(a, q))
    .slice(0, limit)
    .map((e) => ({ url: e.url, title: e.title }))
}

function score(e: HistoryEntry, q: string): number {
  let s = e.visits
  const url = e.url.toLowerCase()
  // Strong boost when the query matches the start of the host.
  if (url.includes(`://${q}`) || url.includes(`://www.${q}`)) s += 50
  if (e.title.toLowerCase().startsWith(q)) s += 10
  // Recency boost (within ~5 days).
  s += Math.max(0, 5 - (Date.now() - e.ts) / 86_400_000)
  return s
}

export function clearHistory(): void {
  entries = []
  writeJSON(FILE, [])
}
