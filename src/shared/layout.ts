// Layout constants shared between the main process (which positions the native
// WebContentsViews) and the renderer CSS (which must leave a matching hole for
// the embedded content to show through). Keep these in sync.

export const TABSTRIP_HEIGHT = 40
export const TOOLBAR_HEIGHT = 44
/** Total height of the browser chrome above the page content. */
export const CHROME_HEIGHT = TABSTRIP_HEIGHT + TOOLBAR_HEIGHT

/** Width of the Assistant side panel (Helixis Copilot) when it is open. The
 *  active page's content view shrinks by this amount to make room on the right. */
export const SIDEBAR_WIDTH = 360

/** Single persistent session so logins survive restarts. */
export const DEFAULT_PROFILE_ID = 'default'
export const DEFAULT_PROFILE_NAME = 'Default'

/** Custom scheme for Helixis-served pages (the new-tab/home page). */
export const HELIXIS_SCHEME = 'helixis'
export const NEWTAB_URL = `${HELIXIS_SCHEME}://newtab`

/** The home / new-tab page. */
export const HOME_URL = NEWTAB_URL
