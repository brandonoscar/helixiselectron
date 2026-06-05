// Quick-launch catalog for the sidebar. Each entry opens an embedded tab in the
// active profile.
//
// NOTE (report Risk 2): Gmail/Google sign-in is blocked inside embedded webviews
// by Google. The Gmail entry is kept for convenience, but real Gmail/Calendar
// access in v1 should go through the official APIs with system-browser OAuth —
// that is the Weeks 7-8 track, not embedded automation.

export interface QuickApp {
  name: string
  url: string
  hint?: string
  /** First-class API integration exists (Weeks 5-6 / 11-12 tracks). */
  api?: boolean
}

export const QUICK_APPS: QuickApp[] = [
  {
    name: 'Buildium',
    url: 'https://signin.managebuilding.com/manager/public/authentication/login',
    api: true,
    hint: 'First-class API integration planned (Weeks 5-6)'
  },
  {
    name: 'RentManager',
    url: 'https://login.rentmanager.com/',
    api: true,
    hint: 'First-class API integration planned (Weeks 11-12)'
  },
  {
    name: 'AppFolio',
    url: 'https://www.appfolio.com/',
    hint: 'UI-surfacing only in v1 (API deferred to v2)'
  },
  {
    name: 'Gmail',
    url: 'https://mail.google.com/',
    hint: 'Embedded sign-in is blocked by Google — use Gmail API (Weeks 7-8)'
  }
]
