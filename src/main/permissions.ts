import { dialog, type Session } from 'electron'

// Permissions a web page must explicitly ask the user for. Anything not listed
// here is granted automatically (e.g. fullscreen). Decisions are remembered per
// origin + permission for the session's lifetime.
const SENSITIVE = new Set([
  'geolocation',
  'media',
  'audioCapture',
  'videoCapture',
  'notifications',
  'clipboard-read',
  'midiSysex'
])

export function installPermissionHandlers(session: Session): void {
  const decisions = new Map<string, boolean>()

  const keyFor = (origin: string, permission: string) => `${origin}|${permission}`

  session.setPermissionRequestHandler((_wc, permission, callback, details) => {
    if (!SENSITIVE.has(permission)) {
      callback(true)
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
        defaultId: 0,
        cancelId: 1,
        title: 'Permission request',
        message: `Allow ${origin} to use ${describe(permission)}?`
      })
      .then(({ response }) => {
        const allowed = response === 0
        decisions.set(key, allowed)
        callback(allowed)
      })
      .catch(() => callback(false))
  })

  session.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    if (!SENSITIVE.has(permission)) return true
    return decisions.get(keyFor(requestingOrigin, permission)) ?? false
  })
}

function safeOrigin(url: string | undefined): string {
  if (!url) return 'This site'
  try {
    return new URL(url).origin
  } catch {
    return 'This site'
  }
}

function describe(permission: string): string {
  switch (permission) {
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
