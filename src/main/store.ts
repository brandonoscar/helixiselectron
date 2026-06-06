import { app } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'

// Tiny JSON persistence under the app's userData directory. Used for window
// state and session (open tabs) restore.

function pathFor(name: string): string {
  return join(app.getPath('userData'), name)
}

export function readJSON<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(pathFor(name), 'utf8')) as T
  } catch {
    return fallback
  }
}

export function writeJSON(name: string, data: unknown): void {
  try {
    writeFileSync(pathFor(name), JSON.stringify(data))
  } catch {
    /* best-effort; ignore write failures */
  }
}

export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null
  return ((...args: never[]) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }) as T
}
