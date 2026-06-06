import { readJSON, writeJSON, debounce } from './store'
import type { Bookmark } from '../shared/types'

const FILE = 'bookmarks.json'

let items: Bookmark[] | null = null
let notifier: ((items: Bookmark[]) => void) | null = null

function load(): Bookmark[] {
  if (!items) items = readJSON<Bookmark[]>(FILE, [])
  return items
}

const persist = debounce(() => writeJSON(FILE, items ?? []), 300)

function changed(): void {
  persist()
  notifier?.(list())
}

export function setBookmarksNotifier(fn: (items: Bookmark[]) => void): void {
  notifier = fn
}

export function list(): Bookmark[] {
  return [...load()]
}

export function has(url: string): boolean {
  return load().some((b) => b.url === url)
}

export function add(url: string, title: string): void {
  if (!/^https?:\/\//i.test(url)) return
  const l = load()
  if (!l.some((b) => b.url === url)) {
    l.unshift({ url, title: title || url })
    changed()
  }
}

export function remove(url: string): void {
  items = load().filter((b) => b.url !== url)
  changed()
}

export function toggle(url: string, title: string): Bookmark[] {
  if (has(url)) remove(url)
  else add(url, title)
  return list()
}
