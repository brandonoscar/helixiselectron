import { app, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import type { TabManager } from './TabManager'

export interface MenuActions {
  /** TabManager of the currently focused window. */
  focused: () => TabManager | null
  newWindow: () => void
  newPrivateWindow: () => void
}

/**
 * Builds and installs the application menu. Accelerators here double as the
 * browser's global keyboard shortcuts — application-menu accelerators fire
 * regardless of which WebContents (chrome or page) currently has focus, and act
 * on the focused window.
 */
export function installAppMenu(actions: MenuActions): void {
  const isMac = process.platform === 'darwin'
  const tabs = (): TabManager | null => actions.focused()

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+T',
          click: () => tabs()?.newTab()
        },
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+N',
          click: () => actions.newWindow()
        },
        {
          label: 'New Private Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => actions.newPrivateWindow()
        },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => tabs()?.closeActive()
        },
        {
          label: 'Reopen Closed Tab',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => tabs()?.reopenClosedTab()
        },
        { type: 'separator' },
        {
          label: 'Print…',
          accelerator: 'CmdOrCtrl+P',
          click: () => tabs()?.printActive()
        },
        {
          label: 'Save as PDF…',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => tabs()?.printToPDFActive()
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find…',
          accelerator: 'CmdOrCtrl+F',
          click: () => tabs()?.toggleFind()
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => tabs()?.reloadActive(false)
        },
        {
          label: 'Force Reload',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => tabs()?.reloadActive(true)
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
          click: () => tabs()?.toggleDevTools()
        },
        { type: 'separator' },
        {
          label: 'Actual Size',
          accelerator: 'CmdOrCtrl+0',
          click: () => tabs()?.zoomReset()
        },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+Plus',
          click: () => tabs()?.zoomIn()
        },
        {
          // Secondary accelerator so both Cmd+= and Cmd++ work.
          label: 'Zoom In ',
          accelerator: 'CmdOrCtrl+=',
          acceleratorWorksWhenHidden: true,
          visible: false,
          click: () => tabs()?.zoomIn()
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => tabs()?.zoomOut()
        },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'History',
      submenu: [
        {
          label: 'Back',
          accelerator: isMac ? 'Cmd+Left' : 'Alt+Left',
          click: () => tabs()?.backActive()
        },
        {
          label: 'Forward',
          accelerator: isMac ? 'Cmd+Right' : 'Alt+Right',
          click: () => tabs()?.forwardActive()
        }
      ]
    },
    {
      label: 'Window',
      submenu: [
        {
          label: 'Select Next Tab',
          accelerator: 'Ctrl+Tab',
          click: () => tabs()?.selectNextTab()
        },
        {
          label: 'Select Previous Tab',
          accelerator: 'Ctrl+Shift+Tab',
          click: () => tabs()?.selectPrevTab()
        },
        { type: 'separator' },
        {
          label: 'Focus Address Bar',
          accelerator: 'CmdOrCtrl+L',
          click: () => tabs()?.focusAddressBar()
        },
        { type: 'separator' },
        { role: 'minimize' },
        ...(isMac ? [{ role: 'zoom' as const }] : []),
        ...(isMac ? [] : [{ role: 'close' as const }])
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'About Helixis',
          click: () =>
            shell.openExternal('https://github.com/brandonoscar/helixiselectron')
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
