import { app, nativeTheme, session, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, type AuroraSettings } from '@shared/models'
import { WINDOW_BG } from '@shared/theme'
import { RENDERER_COMBOS } from '@shared/keymap'
import { openDb } from './services/db'
import { KvStore } from './services/db/kv'
import { HistoryStore } from './services/db/history'
import { ArchiveStore } from './services/db/archive'
import { DownloadsService } from './services/downloads'
import { PermissionService } from './services/permissions'
import { mergeLegacyFavorites, upgradeSession } from './services/session-store'
import { TabManager } from './tabs/tab-manager'
import { INCOGNITO_PARTITION } from './tabs/tab'
import { createChromeWindow } from './windows/chrome-window'
import { registerIpcHandlers } from './ipc/handlers'
import { pushToChrome, setTrustedWebContents } from './ipc/router'
import { installMenu } from './menu'

const AUTO_ARCHIVE_SWEEP_MS = 5 * 60_000

// Must happen before `ready`: the e2e harness isolates each run's profile.
if (process.env.AURORA_USER_DATA_DIR) {
  app.setPath('userData', process.env.AURORA_USER_DATA_DIR)
}
// Deterministic reduced-motion for the e2e audit.
if (process.env.AURORA_FORCE_REDUCED_MOTION === '1') {
  app.commandLine.appendSwitch('force-prefers-reduced-motion')
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
  const archive = new ArchiveStore(db)

  let settings: AuroraSettings = {
    ...DEFAULT_SETTINGS,
    ...(kv.get<AuroraSettings>('settings') ?? {}),
  }

  // The theme setting drives prefers-color-scheme in every renderer via
  // nativeTheme — one pipe for system/light/dark. Set before window creation
  // so the first paint uses the right ground color.
  nativeTheme.themeSource = settings.theme
  nativeTheme.on('updated', () => {
    win?.setBackgroundColor(WINDOW_BG[nativeTheme.shouldUseDarkColors ? 'dark' : 'light'])
  })

  const w = createChromeWindow()
  win = w
  const m = new TabManager(w, {
    history,
    archive,
    saveSession: (snapshot) => kv.set('session', snapshot),
    pushFindResult: (result) => pushToChrome('find:result', result),
  })
  manager = m

  setTrustedWebContents(w.webContents)

  const downloads = new DownloadsService(db, DownloadsService.defaultDirectory(), (list) =>
    pushToChrome('downloads:changed', list),
  )
  const permissions = new PermissionService(kv, (request) =>
    pushToChrome('permissions:request', request),
  )
  const incognitoSession = session.fromPartition(INCOGNITO_PARTITION)
  for (const [ses, persist] of [
    [session.defaultSession, true],
    [incognitoSession, false],
  ] as const) {
    downloads.attach(ses)
    permissions.attach(ses, { persistDecisions: persist })
  }

  registerIpcHandlers({
    manager: m,
    history,
    archive,
    downloads,
    permissions,
    getSettings: () => settings,
    setSettings: (patch) => {
      settings = { ...settings, ...patch }
      kv.set('settings', settings)
      if (patch.theme !== undefined) nativeTheme.themeSource = settings.theme
      return settings
    },
    win: w,
  })
  installMenu({
    manager: m,
    getWindow: () => win,
    sendCommand: (id) => pushToChrome('ui:command', { id }),
  })

  hardenChromeNavigation(w)
  forwardRendererCombos(w)

  // Restore only after the chrome renderer has painted: the shell appears
  // instantly, and no WebContentsView is created while automation harnesses
  // (Playwright's CDP handshake) are still attaching to the fresh process.
  w.webContents.once('did-finish-load', () => {
    restoreSession(kv, m)
    m.autoArchive(settings.todayArchiveHours)
  })

  setInterval(() => m.autoArchive(settings.todayArchiveHours), AUTO_ARCHIVE_SWEEP_MS)

  w.on('closed', () => {
    win = null
  })
}

function restoreSession(kv: KvStore, m: TabManager): void {
  const upgraded = upgradeSession(kv.get('session'))
  if (upgraded) {
    m.restore(mergeLegacyFavorites(upgraded, kv.get('favorites')))
  } else {
    m.ensureDefaultSpace()
  }
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
 * Renderer-scope shortcuts while a *page* has focus: menu accelerators are
 * unregistered on Windows/Linux for these (see menu.ts), so intercept them on
 * tab webContents and route them to the chrome renderer.
 */
function forwardRendererCombos(w: BrowserWindow): void {
  app.on('web-contents-created', (_event, wc) => {
    if (wc === w.webContents) return
    wc.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      const mod = process.platform === 'darwin' ? input.meta : input.control
      if (!mod || input.alt) return
      const key = input.key.toLowerCase()
      const entry = RENDERER_COMBOS.find((c) => c.key === key && (c.shift ?? false) === input.shift)
      if (entry) {
        event.preventDefault()
        pushToChrome('ui:command', { id: entry.command })
      }
    })
  })
}
