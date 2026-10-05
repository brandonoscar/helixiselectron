/**
 * Security policy tests (2026-07 audit) — the three exposures, pinned.
 *
 * Pure-helper matrices for sender classification, external-URL scheme
 * validation, and CDP policy, plus SOURCE-SCAN tripwires: any future bare
 * `ipcMain.handle` in ipc.ts (bypassing the sender guard) or an unvalidated
 * openExternal in copilot.ts fails CI here, the same way the backend's
 * dispatch-path test guards its write pipeline.
 */

import { describe, expect, it } from 'vitest'
import { classifySenderUrl, cdpPortFor, isSafeExternalUrl } from './security'
import { readdirSync } from 'node:fs'
import { callsIn, webContentsViewSandbox } from './testing/ast'

const POLICY = {
  rendererUrl: 'http://localhost:5173'
}

describe('classifySenderUrl', () => {
  it('recognises the packaged chrome renderer on app://chrome', () => {
    expect(classifySenderUrl('app://chrome/index.html', POLICY)).toBe('chrome')
  })

  it('recognises the dev chrome renderer', () => {
    expect(classifySenderUrl('http://localhost:5173/index.html', POLICY)).toBe('chrome')
  })

  it('trusts no remote origin and not the copilot panel', () => {
    // The old docked web app was copilot-tier; since 2026-10 nothing remote
    // reaches the chrome's channels.
    expect(classifySenderUrl('https://agentichelixis.vercel.app/chat', POLICY)).toBe('untrusted')
    // The bundled copilot has its own channels (copilotIpc.ts), not these.
    expect(classifySenderUrl('app://copilot/panel.html', POLICY)).toBe('untrusted')
  })

  it('treats every other origin as untrusted — including lookalikes', () => {
    expect(classifySenderUrl('https://evil.example.com/', POLICY)).toBe('untrusted')
    expect(classifySenderUrl('http://localhost:5173.evil.com/', POLICY)).toBe('untrusted')
    expect(classifySenderUrl('app://chrome.evil/index.html', POLICY)).toBe('untrusted')
    // file:// is no longer how the chrome loads, so it is never trusted.
    expect(
      classifySenderUrl('file:///Applications/Occupella.app/out/renderer/index.html', POLICY)
    ).toBe('untrusted')
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

describe('source tripwires (syntax tree, so comments never count)', () => {
  it('ipc.ts registers every channel through the sender guard', () => {
    const handles = callsIn('ipc.ts', 'ipcMain.handle')
    // Exactly ONE ipcMain.handle call may exist: inside the guard wrapper.
    expect(handles.map((c) => c.enclosingFunction)).toEqual(['handle'])
    // The data-destructive channels go through that guard.
    const guarded = callsIn('ipc.ts', 'handle').map((c) => c.firstArg)
    for (const channel of [
      'settings:clearData',
      'settings:makeDefaultBrowser',
      'history:clear',
      'bookmarks:remove'
    ]) {
      expect(guarded).toContain(channel)
    }
    // The remote-copilot channel is gone.
    expect(guarded).not.toContain('page:context')
  })

  it('copilotIpc.ts registers every channel through the copilot guard', () => {
    const handles = callsIn('copilotIpc.ts', 'ipcMain.handle')
    expect(handles.map((c) => c.enclosingFunction)).toEqual(['handleCopilot'])
    expect(callsIn('copilotIpc.ts', 'handleCopilot').map((c) => c.firstArg).sort()).toEqual([
      'copilot:http:abort',
      'copilot:http:start',
      'copilot:notifyApproval',
      'copilot:pageContext',
      'copilot:setPendingApprovals'
    ])
  })

  it('copilot.ts scheme-validates every openExternal', () => {
    const calls = callsIn('copilot.ts', 'shell.openExternal')
    expect(calls.length).toBeGreaterThan(0)
    for (const c of calls) expect(c.guardedBy).toContain('isSafeExternalUrl(url)')
  })

  it('every WebContentsView is created with sandbox: true', () => {
    let views = 0
    for (const file of readdirSync(__dirname).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      for (const sandbox of webContentsViewSandbox(file)) {
        views++
        expect(sandbox, `${file}: a WebContentsView without sandbox: true`).toBe(true)
      }
    }
    // chrome view, tab views, copilot view
    expect(views).toBeGreaterThanOrEqual(3)
  })

  it('index.ts routes CDP policy through cdpPortFor', () => {
    const calls = callsIn('index.ts', 'cdpPortFor')
    expect(calls.map((c) => c.text)).toEqual(['cdpPortFor(process.env, app.isPackaged)'])
  })
})
