import { app, dialog, session, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import type { SessionSnapshot } from '@shared/models'
import { openDb } from './services/db'
import { KvStore } from './services/db/kv'
import { HistoryStore } from './services/db/history'
import { FavoritesService } from './services/favorites'
import { TabManager } from './tabs/tab-manager'
import { createChromeWindow } from './windows/chrome-window'
import { registerIpcHandlers } from './ipc/handlers'
import { pushToChrome, setTrustedWebContents } from './ipc/router'
import { installMenu } from './menu'
import { RENDERER_COMBO_KEYS } from './services/shortcuts'
import { isE2E } from './env'

// Must happen before `ready`: the e2e harness isolates each run's profile.
if (process.env.AURORA_USER_DATA_DIR) {
  app.setPath('userData', process.env.AURORA_USER_DATA_DIR)
}
app.setName('Aurora')

let win: BrowserWindow | null = null
let manager: TabManager | null = null

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  app.on('before-quit', () => {
    manager?.saveSessionNow()
  })

  void app.whenReady().then(bootstrap)
}

function bootstrap(): void {
  const db = openDb(join(app.getPath('userData'), 'data', 'aurora.db'))
  const kv = new KvStore(db)
  const history = new HistoryStore(db)

  const w = createChromeWindow()
  win = w
  const m = new TabManager(w, {
    history,
    saveSession: (snapshot) => kv.set('session', snapshot),
  })
  manager = m

  setTrustedWebContents(w.webContents)
  const favorites = new FavoritesService(kv, (f) => pushToChrome('favorites:changed', f))
  registerIpcHandlers({ manager: m, favorites, win: w })
  installMenu({
    manager: m,
    getWindow: () => win,
    sendCommand: (id) => pushToChrome('ui:command', { id }),
  })

  hardenChromeNavigation(w)
  forwardRendererCombos(w)
  installPermissionHandler(() => win)

  // Restore only after the chrome renderer has painted: the shell appears
  // instantly, and no WebContentsView is created while automation harnesses
  // (Playwright's CDP handshake) are still attaching to the fresh process.
  w.webContents.once('did-finish-load', () => restoreSession(kv, m))

  w.on('closed', () => {
    win = null
  })
}

function restoreSession(kv: KvStore, m: TabManager): void {
  const snap = kv.get<SessionSnapshot>('session')
  if (!snap || !Array.isArray(snap.tabs) || snap.tabs.length === 0) return
  for (const t of snap.tabs) {
    m.create({ url: t.url, lazy: true, activate: false, title: t.title, faviconUrl: t.faviconUrl })
  }
  m.activateAt(Math.min(Math.max(0, snap.activeIndex), snap.tabs.length - 1))
}

/** The chrome renderer only ever displays the bundled UI. */
function hardenChromeNavigation(w: BrowserWindow): void {
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  w.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL
    const allowed = (devUrl && url.startsWith(devUrl)) || url.startsWith('file://')
    if (!allowed) event.preventDefault()
  })
}

/**
 * Renderer-scope shortcuts (Cmd/Ctrl+T/L/S) while a *page* has focus: menu
 * accelerators are unregistered on Windows/Linux for these (see menu.ts), so
 * intercept them on tab webContents and route them to the chrome renderer.
 */
function forwardRendererCombos(w: BrowserWindow): void {
  app.on('web-contents-created', (_event, wc) => {
    if (wc === w.webContents) return
    wc.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      const mod = process.platform === 'darwin' ? input.meta : input.control
      if (!mod || input.alt || input.shift) return
      const command = RENDERER_COMBO_KEYS[input.key.toLowerCase()]
      if (command) {
        event.preventDefault()
        pushToChrome('ui:command', { id: command })
      }
    })
  })
}

const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  notifications: 'show notifications',
  geolocation: 'know your location',
  media: 'use your camera or microphone',
  'clipboard-read': 'read your clipboard',
  midi: 'use MIDI devices',
  midiSysex: 'use MIDI devices',
}

/**
 * Phase (a) stopgap: native per-request prompt, deny-by-default.
 * Phase (b) replaces this with in-chrome permission UI + persistence.
 */
function installPermissionHandler(getWin: () => BrowserWindow | null): void {
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    if (
      permission === 'fullscreen' ||
      permission === 'clipboard-sanitized-write' ||
      permission === 'pointerLock'
    ) {
      callback(true)
      return
    }
    const describe = PERMISSION_DESCRIPTIONS[permission]
    const w = getWin()
    if (!describe || !w || isE2E) {
      callback(false)
      return
    }
    const requestingUrl =
      'requestingUrl' in details && typeof details.requestingUrl === 'string'
        ? details.requestingUrl
        : wc.getURL()
    let host = requestingUrl
    try {
      host = new URL(requestingUrl).host
    } catch {
      /* keep raw string */
    }
    void dialog
      .showMessageBox(w, {
        type: 'question',
        buttons: ['Block', 'Allow'],
        defaultId: 0,
        cancelId: 0,
        message: `Allow ${host || 'this site'} to ${describe}?`,
      })
      .then((result) => callback(result.response === 1))
      .catch(() => callback(false))
  })
}
