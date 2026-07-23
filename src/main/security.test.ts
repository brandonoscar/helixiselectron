/**
 * Security policy tests (2026-07 audit) — the three exposures, pinned.
 *
 * Pure-helper matrices for sender classification, external-URL scheme
 * validation, and CDP policy, plus SOURCE-SCAN tripwires: any future bare
 * `ipcMain.handle` in ipc.ts (bypassing the sender guard) or an unvalidated
 * openExternal in copilot.ts fails CI here, the same way the backend's
 * dispatch-path test guards its write pipeline.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { classifySenderUrl, cdpPortFor, isSafeExternalUrl } from './security'

const POLICY = {
  rendererUrl: 'http://localhost:5173',
  copilotOrigin: 'https://agentichelixis.vercel.app'
}

describe('classifySenderUrl', () => {
  it('recognises the packaged chrome renderer', () => {
    expect(
      classifySenderUrl('file:///Applications/Helixis.app/out/renderer/index.html', POLICY)
    ).toBe('chrome')
  })

  it('recognises the dev chrome renderer', () => {
    expect(classifySenderUrl('http://localhost:5173/index.html', POLICY)).toBe('chrome')
  })

  it('grants the copilot origin copilot-tier only', () => {
    expect(classifySenderUrl('https://agentichelixis.vercel.app/chat', POLICY)).toBe('copilot')
  })

  it('treats every other origin as untrusted — including lookalikes', () => {
    expect(classifySenderUrl('https://evil.example.com/', POLICY)).toBe('untrusted')
    expect(classifySenderUrl('https://agentichelixis.vercel.app.evil.com/', POLICY)).toBe(
      'untrusted'
    )
    // A tab page can never be a trusted sender even over file://.
    expect(classifySenderUrl('file:///tmp/evil.html', POLICY)).toBe('untrusted')
  })

  it('fails closed on missing/malformed URLs and absent dev server', () => {
    expect(classifySenderUrl(undefined, POLICY)).toBe('untrusted')
    expect(classifySenderUrl('not a url', POLICY)).toBe('untrusted')
    expect(
      classifySenderUrl('http://localhost:5173/x', { ...POLICY, rendererUrl: null })
    ).toBe('untrusted')
  })
})

describe('isSafeExternalUrl', () => {
  it('allows exactly http(s) and mailto', () => {
    expect(isSafeExternalUrl('https://accounts.google.com/o/oauth2/auth')).toBe(true)
    expect(isSafeExternalUrl('http://example.com')).toBe(true)
    expect(isSafeExternalUrl('mailto:owner@example.com')).toBe(true)
  })

  it('drops URI schemes a remote page could weaponize', () => {
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false)
    // eslint-disable-next-line no-script-url
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('smb://attacker/share')).toBe(false)
    expect(isSafeExternalUrl('vscode://evil')).toBe(false)
    expect(isSafeExternalUrl('not a url')).toBe(false)
  })
})

describe('cdpPortFor', () => {
  it('packaged builds are CDP-off — no env override, ever', () => {
    expect(cdpPortFor({}, true)).toBeNull()
    expect(cdpPortFor({ HELIXIS_CDP_PORT: '9222' }, true)).toBeNull()
    expect(cdpPortFor({ HELIXIS_CDP: '1' }, true)).toBeNull()
  })

  it('dev defaults to 9222, honours the port override and the kill switch', () => {
    expect(cdpPortFor({}, false)).toBe(9222)
    expect(cdpPortFor({ HELIXIS_CDP_PORT: '9333' }, false)).toBe(9333)
    expect(cdpPortFor({ HELIXIS_CDP: '0' }, false)).toBeNull()
    expect(cdpPortFor({ HELIXIS_CDP_PORT: 'nonsense' }, false)).toBeNull()
  })
})

describe('source tripwires', () => {
  const read = (name: string): string => readFileSync(join(__dirname, name), 'utf-8')

  it('ipc.ts registers every channel through the sender guard', () => {
    const src = read('ipc.ts')
    // Exactly ONE ipcMain.handle call may exist: inside the guard wrapper.
    const calls = src.match(/ipcMain\.handle\(/g) ?? []
    expect(calls).toHaveLength(1)
    // The privileged channels must be chrome-only.
    for (const channel of [
      'settings:clearData',
      'settings:makeDefaultBrowser',
      'history:clear',
      'bookmarks:remove'
    ]) {
      expect(src).toMatch(new RegExp(`handle\\('${channel}', CHROME[,)]`))
    }
    // The copilot's ONLY channel.
    expect(src).toContain("handle('page:context', CHROME_OR_COPILOT")
  })

  it('copilot.ts scheme-validates every openExternal', () => {
    const src = read('copilot.ts')
    expect(src).toContain('isSafeExternalUrl(url)')
    // No unconditional openExternal call anywhere in the file.
    expect(src).not.toMatch(/\{\s*void shell\.openExternal\(url\)/)
  })

  it('index.ts routes CDP policy through cdpPortFor', () => {
    const src = read('index.ts')
    expect(src).toContain('cdpPortFor(process.env, app.isPackaged)')
    expect(src).not.toContain('function resolveCdpPort')
  })
})
