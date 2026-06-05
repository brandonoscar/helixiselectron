// Layout constants shared between the main process (which positions the native
// WebContentsViews) and the renderer CSS (which must leave a matching hole for
// the embedded content to show through). Keep these in sync.

export const TABSTRIP_HEIGHT = 40
export const TOOLBAR_HEIGHT = 44
/** Total height of the browser chrome above the page content. */
export const CHROME_HEIGHT = TABSTRIP_HEIGHT + TOOLBAR_HEIGHT

/** Single persistent session so logins survive restarts. */
export const DEFAULT_PROFILE_ID = 'default'
export const DEFAULT_PROFILE_NAME = 'Default'

export const HOME_URL = 'https://www.google.com'
