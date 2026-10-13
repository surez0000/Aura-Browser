import {
  BrowserWindow,
  Menu,
  type BaseWindow,
  type BrowserWindowConstructorOptions,
  type MenuItemConstructorOptions,
} from 'electron'

/**
 * Sign-in popups: what a page gets from `window.open` *with* window features,
 * the shape every "Sign in with Google / Apple / Microsoft" button uses. They
 * open as real windows rather than tabs because these flows report back
 * through `window.opener` and end by calling `window.close()`. A tab has no
 * opener, so the sign-in never reached the page that asked for it.
 *
 * Electron creates the window itself, on the opener's session, so the login
 * lands in the right Space. This only dresses it.
 */

type OpenHandler = Parameters<Electron.WebContents['setWindowOpenHandler']>[0]

const popups = new WeakSet<BaseWindow>()

/** Window options for a popup the page asked for; size and place come from its features. */
export function popupWindowOptions(): BrowserWindowConstructorOptions {
  // Kept above the window it came from, so a popup from a full-screen window
  // opens on top of it rather than on another desktop.
  const parent = BrowserWindow.getFocusedWindow()
  return {
    ...(parent ? { parent } : {}),
    minWidth: 320,
    minHeight: 240,
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    fullscreenable: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  }
}

/** True for a window `adoptPopup` set up: page commands act on it, not on a tab. */
export function isPopupWindow(win: BaseWindow | undefined): win is BrowserWindow {
  return !!win && popups.has(win)
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

/**
 * Wire a popup Electron just created. `openWindow` is the opener tab's own
 * window-open handler, so links and further popups from it behave as they
 * would from the tab.
 */
export function adoptPopup(win: BrowserWindow, openWindow: OpenHandler): void {
  popups.add(win)
  const wc = win.webContents
  wc.setWindowOpenHandler(openWindow)
  wc.on('did-create-window', (child) => adoptPopup(child, openWindow))

  // There is no address bar, so the title bar names the site you are signing
  // in to before the page's own title.
  const label = (title: string): void => {
    if (win.isDestroyed()) return
    const host = hostOf(wc.getURL())
    win.setTitle(host && title && title !== host ? `${host} — ${title}` : host || title)
  }
  win.on('page-title-updated', (event, title) => {
    event.preventDefault()
    label(title)
  })
  wc.on('did-navigate', () => label(wc.getTitle()))

  // Sign-in forms are where codes and passwords get pasted.
  wc.on('context-menu', (_event, params) => {
    const items: MenuItemConstructorOptions[] = params.isEditable
      ? [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }]
      : params.selectionText.trim()
        ? [{ role: 'copy' }]
        : []
    if (items.length > 0) Menu.buildFromTemplate(items).popup({ window: win })
  })
}
