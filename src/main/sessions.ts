import { session, type Session } from 'electron'
import { DEFAULT_PROFILE_ID } from '../shared/layout'

// A single *persistent* partition so cookies, localStorage and IndexedDB survive
// restarts — which is what keeps sites logged in across app launches.
const PARTITION = `persist:helixis-${DEFAULT_PROFILE_ID}`

export function browserSession(): Session {
  return session.fromPartition(PARTITION)
}
