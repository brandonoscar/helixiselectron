import { session, type Session } from 'electron'
import type { Profile } from '../shared/types'
import { DEFAULT_PROFILE_ID, DEFAULT_PROFILE_NAME } from '../shared/layout'

// Each profile is backed by a *persistent* partition so cookies, localStorage,
// IndexedDB and the fingerprint surface survive restarts — which is exactly what
// makes the embedded PM SaaS / mail tabs stay logged in across app launches.
const PARTITION_PREFIX = 'persist:helixis-'

const profiles = new Map<string, Profile>()

export function partitionFor(profileId: string): string {
  return `${PARTITION_PREFIX}${profileId}`
}

export function sessionFor(profileId: string): Session {
  return session.fromPartition(partitionFor(profileId))
}

export function listProfiles(): Profile[] {
  return [...profiles.values()]
}

export function hasProfile(profileId: string): boolean {
  return profiles.has(profileId)
}

export function createProfile(name: string): Profile {
  const id = `${slugify(name)}-${Math.random().toString(36).slice(2, 8)}`
  const profile: Profile = { id, name: name.trim() || id }
  profiles.set(id, profile)
  // Touch the session so the partition is created eagerly.
  sessionFor(id)
  return profile
}

export function ensureDefaultProfile(): Profile {
  if (!profiles.has(DEFAULT_PROFILE_ID)) {
    const profile: Profile = { id: DEFAULT_PROFILE_ID, name: DEFAULT_PROFILE_NAME }
    profiles.set(DEFAULT_PROFILE_ID, profile)
    sessionFor(DEFAULT_PROFILE_ID)
  }
  return profiles.get(DEFAULT_PROFILE_ID)!
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'profile'
  )
}
