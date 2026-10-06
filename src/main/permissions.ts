import { dialog, type Session } from 'electron'

// Browsing sessions sort every permission into exactly one of three buckets.
// Anything Electron adds later that is in none of them is DENIED: Electron's
// own default is to approve every request when no handler is set, so a
// permission nobody reviewed must not slip through as "granted".

/** Harmless, granted without asking (what Chrome also grants silently). */
export const ALWAYS_ALLOW = new Set([
  'fullscreen',
  'clipboard-sanitized-write',
  'pointerLock',
  'keyboardLock'
])

/** Asked once per origin per run, then remembered for the session. */
export const ASK = new Set([
  'geolocation',
  'media',
  'audioCapture',
  'videoCapture',
  'notifications',
  'clipboard-read',
  'midi',
  'midiSysex',
  'idle-detection',
  'storage-access',
  'top-level-storage-access',
  'fileSystem',
  'window-management',
  // A page asking to launch another app (zoommtg:, msteams:, tel: …).
  'openExternal'
])

export type PermissionVerdict = 'allow' | 'ask' | 'deny'

export function verdictFor(permission: string): PermissionVerdict {
  if (ALWAYS_ALLOW.has(permission)) return 'allow'
  if (ASK.has(permission)) return 'ask'
  return 'deny'
}

/** Permission policy for a session that loads arbitrary websites. */
export function installPermissionHandlers(session: Session): void {
  const decisions = new Map<string, boolean>()

  const keyFor = (origin: string, permission: string) => `${origin}|${permission}`

  session.setPermissionRequestHandler((_wc, permission, callback, details) => {
    const verdict = verdictFor(permission)
    if (verdict !== 'ask') {
      callback(verdict === 'allow')
      return
    }
    const origin = safeOrigin(details.requestingUrl)
    const key = keyFor(origin, permission)
    const remembered = decisions.get(key)
    if (remembered !== undefined) {
      callback(remembered)
      return
    }
    dialog
      .showMessageBox({
        type: 'question',
        buttons: ['Allow', 'Block'],
        defaultId: 1,
        cancelId: 1,
        title: 'Permission request',
        message: `Allow ${origin} to use ${describe(permission, 'externalURL' in details ? details.externalURL : undefined)}?`
      })
      .then(({ response }) => {
        const allowed = response === 0
        decisions.set(key, allowed)
        callback(allowed)
      })
      .catch(() => callback(false))
  })

  session.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    const verdict = verdictFor(permission)
    if (verdict !== 'ask') return verdict === 'allow'
    return decisions.get(keyFor(requestingOrigin, permission)) ?? false
  })

  // WebHID / WebSerial / WebUSB device access: no chooser UI exists in this
  // browser, so never grant it.
  session.setDevicePermissionHandler(() => false)
}

/** Permission policy for the app's own pages (the chrome UI, the copilot):
 *  no prompts, everything denied except copying to the clipboard. */
export function installAppPagePermissions(session: Session): void {
  const allowed = (permission: string) => permission === 'clipboard-sanitized-write'
  session.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed(permission)))
  session.setPermissionCheckHandler((_wc, permission) => allowed(permission))
  session.setDevicePermissionHandler(() => false)
}

function safeOrigin(url: string | undefined): string {
  if (!url) return 'This site'
  try {
    return new URL(url).origin
  } catch {
    return 'This site'
  }
}

function describe(permission: string, externalURL: string | undefined): string {
  switch (permission) {
    case 'openExternal': {
      let scheme = 'another app'
      try {
        if (externalURL) scheme = `the app that opens ${new URL(externalURL).protocol} links`
      } catch {
        /* keep the generic wording */
      }
      return scheme
    }
    case 'geolocation':
      return 'your location'
    case 'media':
    case 'audioCapture':
    case 'videoCapture':
      return 'your camera and microphone'
    case 'notifications':
      return 'notifications'
    case 'clipboard-read':
      return 'your clipboard'
    default:
      return permission
  }
}
