/**
 * The copilot panel's signed-out contract (founder feedback, v0.1.0 build):
 * a fresh install must never show a second login form beside the main
 * tab's — pre-auth the panel shows a static "sign in first" placeholder.
 * The pure pieces (auth-check expression, placeholder markup) are pinned
 * here; the WebContentsView wiring is exercised by the boot smoke.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  WebContentsView: class {},
  shell: { openExternal: vi.fn() },
}))

import { AUTH_CHECK_JS, appUrl, placeholderHTML } from './copilot'

describe('AUTH_CHECK_JS', () => {
  // Evaluate the exact expression the panel injects, against a stand-in
  // localStorage, so the supabase-js key convention stays pinned.
  const evalWith = (keys: string[]): boolean =>
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function('localStorage', `return ${AUTH_CHECK_JS}`)({
      ...Object.fromEntries(keys.map((k) => [k, 'x'])),
    } as never) as boolean

  it('is true when a supabase session token exists', () => {
    expect(evalWith(['sb-shwwcxkeewpotnigwvqp-auth-token'])).toBe(true)
  })

  it('is false with no token (fresh install) or unrelated keys', () => {
    expect(evalWith([])).toBe(false)
    expect(evalWith(['theme', 'sb-ref-auth-token-code-verifier'])).toBe(false)
  })
})

describe('placeholderHTML', () => {
  const html = placeholderHTML('Ctrl+E')

  it('names the shortcut and points at the main window', () => {
    expect(html).toContain('Ctrl+E')
    expect(html).toContain('main window')
    expect(html).toContain('Sign in to Occupella')
  })

  it('is fully static — no scripts, no external fetches, no login form', () => {
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/https?:\/\//i)
    expect(html).not.toMatch(/<input|<form/i)
  })
})

describe('appUrl', () => {
  it('defaults to the deployed app', () => {
    expect(appUrl()).toBe('https://agentichelixis.vercel.app')
  })
})
