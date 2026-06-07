import { session, type Session } from 'electron'
import { DEFAULT_PROFILE_ID } from '../shared/layout'

// A single *persistent* partition so cookies, localStorage and IndexedDB survive
// restarts — which is what keeps sites logged in across app launches.
const PARTITION = `persist:helixis-${DEFAULT_PROFILE_ID}`

export function browserSession(): Session {
  return session.fromPartition(PARTITION)
}

/** A fresh, non-persistent session for a private window. The partition name has
 *  no `persist:` prefix, so cookies/storage live only in memory and vanish when
 *  the window closes. Each private window gets its own. */
export function privateSession(): Session {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  return session.fromPartition(`helixis-private-${id}`)
}
