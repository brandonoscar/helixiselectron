/**
 * Pages the copilot never reads as chat context: property-management system
 * screens. Occupella's terms rules for every PMS it connects to allow the
 * documented API only, no scraping (AgenticHelixis design/*-terms*.md and
 * Buildium's API license, ToS §18). Reading the customer's PMS screens into
 * the prompt is scraping, so PMS data arrives through the backend's API
 * connection and never from a browser tab.
 *
 * The panel checks the same list (resources/copilot/context-policy.js, copied
 * from the extension). This main-process copy is the one that counts: it runs
 * before anything executes in the tab. contextPolicy.test.ts reads both lists
 * and fails if they drift.
 */
export const NO_CONTEXT_DOMAINS = [
  'managebuilding.com', // Buildium
  'rentvine.com',
  'rentmanager.com',
  'propertyware.com'
]

/** True when the copilot may read this page. Fail closed on a URL that does
 *  not parse, and on anything that is not a web page. */
export function contextAllowed(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
  const hostname = u.hostname.toLowerCase()
  return !NO_CONTEXT_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`))
}
