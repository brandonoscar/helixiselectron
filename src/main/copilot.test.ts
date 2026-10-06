/**
 * The bundled copilot and the browser hardening that shipped with it
 * (2026-10). Pure helpers plus tests that read BOTH sides of a boundary:
 * the vendored extension files vs the main-process allowlists, the panel's
 * platform imports vs the desktop platform.js exports, and the app id vs
 * electron-builder.yml.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COPILOT_HTTP_ORIGINS, parseHttpRequest } from './copilotNet'
import { contextAllowed, NO_CONTEXT_DOMAINS } from './contextPolicy'
import { contentTypeFor, isAppUrl, resolveInside } from './appProtocol'
import { isOnScreen } from './windowBounds'
import { verdictFor } from './permissions'
import { APP_ID } from '../shared/layout'
import { exportsOf, platformNamesUsed } from './testing/ast'

const ROOT = resolve(__dirname, '../..')
const COPILOT_DIR = join(ROOT, 'resources/copilot')

const okReq = {
  id: 'abcdef12-3456',
  url: 'https://agentichelixis.onrender.com/api/v1/agent/run',
  method: 'POST',
  headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
  body: '{"task":"hi"}'
}

describe('copilot network bridge (parseHttpRequest)', () => {
  it('accepts a backend or Supabase request', () => {
    expect(parseHttpRequest(okReq)?.method).toBe('POST')
    expect(
      parseHttpRequest({ ...okReq, url: 'https://shwwcxkeewpotnigwvqp.supabase.co/auth/v1/otp' })
    ).not.toBeNull()
  })

  it('is not an open proxy', () => {
    for (const url of [
      'https://evil.example.com/',
      'http://agentichelixis.onrender.com/api', // plain http
      'https://agentichelixis.onrender.com.evil.com/',
      'https://other-project.supabase.co/auth/v1/otp',
      'file:///etc/passwd',
      'not a url'
    ]) {
      expect(parseHttpRequest({ ...okReq, url }), url).toBeNull()
    }
  })

  it('refuses malformed requests', () => {
    expect(parseHttpRequest(null)).toBeNull()
    expect(parseHttpRequest({ ...okReq, id: 'x' })).toBeNull()
    expect(parseHttpRequest({ ...okReq, method: 'TRACE' })).toBeNull()
    expect(parseHttpRequest({ ...okReq, body: { not: 'a string' } })).toBeNull()
    expect(parseHttpRequest({ ...okReq, headers: { 'X-A': 'one\r\nX-B: two' } })).toBeNull()
    expect(parseHttpRequest({ ...okReq, body: 'x'.repeat(1_000_001) })).toBeNull()
  })

  it('drops headers the network stack owns', () => {
    const req = parseHttpRequest({ ...okReq, headers: { Cookie: 'a=b', Origin: 'https://x', 'X-Ok': '1' } })
    expect(req?.headers).toEqual({ 'X-Ok': '1' })
  })

  it('allowlist matches the copilot config.js (both sides read)', async () => {
    const cfg = await import('../../resources/copilot/config.js')
    expect([...COPILOT_HTTP_ORIGINS].sort()).toEqual(
      [new URL(cfg.API_URL).origin, new URL(cfg.SUPABASE_URL).origin].sort()
    )
  })
})

describe('page context policy', () => {
  it('never reads PMS screens, on any subdomain', () => {
    for (const url of [
      'https://acme.managebuilding.com/manager/app/tenants/1',
      'https://signin.managebuilding.com/',
      'https://ACME.rentvine.com/',
      'https://app.propertyware.com/',
      'https://x.api.rentmanager.com/'
    ]) {
      expect(contextAllowed(url), url).toBe(false)
    }
  })

  it('reads ordinary web pages, fails closed on everything else', () => {
    expect(contextAllowed('https://www.zillow.com/x')).toBe(true)
    expect(contextAllowed('https://notmanagebuilding.com/')).toBe(true)
    expect(contextAllowed('helixis://newtab')).toBe(false)
    expect(contextAllowed('file:///etc/passwd')).toBe(false)
    expect(contextAllowed('')).toBe(false)
  })

  it('main-process list matches the panel list (both sides read)', async () => {
    const panel = await import('../../resources/copilot/context-policy.js')
    expect([...NO_CONTEXT_DOMAINS].sort()).toEqual([...panel.NO_CONTEXT_DOMAINS].sort())
  })
})

describe('vendored extension panel', () => {
  it('desktop platform.js exports everything the shared panel files use', () => {
    const exported = exportsOf(join(COPILOT_DIR, 'platform.js'))
    for (const file of ['panel.js', 'auth.js', 'agent.js']) {
      for (const name of platformNamesUsed(join(COPILOT_DIR, file))) {
        expect(exported, `${file} uses platform.${name}`).toContain(name)
      }
    }
  })

  it('every shared file is present and SOURCE names the extension commit', () => {
    for (const f of ['panel.html', 'panel.css', 'panel.js', 'auth.js', 'agent.js', 'config.js', 'context-policy.js']) {
      expect(existsSync(join(COPILOT_DIR, f)), f).toBe(true)
    }
    expect(readFileSync(join(COPILOT_DIR, 'SOURCE'), 'utf8')).toMatch(
      /^brandonoscar\/helixis-sidebar@[0-9a-f]{40}\n/
    )
  })
})

describe('app:// file serving', () => {
  const root = '/srv/app'
  it('maps paths inside the root', () => {
    expect(resolveInside(root, '/panel.html')).toBe('/srv/app/panel.html')
    expect(resolveInside(root, '/')).toBe('/srv/app/index.html')
    expect(resolveInside(root, '/assets/a.js')).toBe('/srv/app/assets/a.js')
  })

  it('refuses anything that escapes it', () => {
    expect(resolveInside(root, '/%2e%2e/%2e%2e/etc/passwd')).toBeNull()
    expect(resolveInside(root, '/..%2fsecret')).toBeNull()
    expect(resolveInside(root, '/a%00.html')).toBeNull()
    expect(resolveInside(root, '/%E0%A4%A')).toBeNull()
  })

  it('serves known types only', () => {
    expect(contentTypeFor('a.js')).toMatch(/javascript/)
    expect(contentTypeFor('SOURCE')).toBeNull()
    expect(contentTypeFor('a.exe')).toBeNull()
  })

  it('matches app:// hosts exactly', () => {
    expect(isAppUrl('app://copilot/panel.html', 'copilot')).toBe(true)
    expect(isAppUrl('app://copilot.evil/panel.html', 'copilot')).toBe(false)
    expect(isAppUrl('https://copilot/panel.html', 'copilot')).toBe(false)
    expect(isAppUrl(undefined, 'copilot')).toBe(false)
  })
})

describe('window position restore', () => {
  const laptop = { x: 0, y: 0, width: 1440, height: 875 }
  it('keeps a window that is on a current display', () => {
    expect(isOnScreen({ x: 100, y: 100, width: 1200, height: 800 }, [laptop])).toBe(true)
  })
  it('drops a window left on an unplugged monitor', () => {
    expect(isOnScreen({ x: 2000, y: 100, width: 1200, height: 800 }, [laptop])).toBe(false)
    // Only a sliver still visible is as good as gone.
    expect(isOnScreen({ x: 1400, y: 100, width: 1200, height: 800 }, [laptop])).toBe(false)
  })
})

describe('browsing permissions', () => {
  it('denies anything nobody reviewed', () => {
    expect(verdictFor('some-future-permission')).toBe('deny')
    expect(verdictFor('hid')).toBe('deny')
    expect(verdictFor('unknown')).toBe('deny')
  })
  it('asks before launching another app or reading sensitive data', () => {
    expect(verdictFor('openExternal')).toBe('ask')
    expect(verdictFor('geolocation')).toBe('ask')
    expect(verdictFor('clipboard-read')).toBe('ask')
  })
  it('grants the harmless ones silently', () => {
    expect(verdictFor('fullscreen')).toBe('allow')
    expect(verdictFor('clipboard-sanitized-write')).toBe('allow')
  })
})

describe('app id', () => {
  it('equals electron-builder appId (Windows notifications key on it)', () => {
    const yml = readFileSync(join(ROOT, 'electron-builder.yml'), 'utf8')
    expect(yml.match(/^appId:\s*(\S+)\s*$/m)?.[1]).toBe(APP_ID)
  })
})
