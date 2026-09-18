import { app, nativeTheme, type BrowserWindow } from 'electron'
import { existsSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DEFAULT_SETTINGS, type AuroraSettings } from '@shared/models'
import { WINDOW_BG } from '@shared/theme'
import { RENDERER_COMBOS } from '@shared/keymap'
import { openDb } from './services/db'
import { KvStore } from './services/db/kv'
import { HistoryStore } from './services/db/history'
import { ArchiveStore } from './services/db/archive'
import { DownloadsService } from './services/downloads'
import { PermissionService } from './services/permissions'
import { DisplayCaptureService } from './services/display-capture'
import { ExtensionService } from './services/extensions'
import { UpdaterService } from './services/updater'
import { mergeLegacyFavorites, upgradeSession } from './services/session-store'
import { TabManager } from './tabs/tab-manager'
import { DEFAULT_PARTITION } from './tabs/partition-names'
import { TRAFFIC_LIGHTS, createChromeWindow } from './windows/chrome-window'
import { MiniWindowService } from './windows/mini-window'
import { registerIpcHandlers } from './ipc/handlers'
import { addTrustedWebContents, pushTo, pushToChrome, setTrustedWebContents } from './ipc/router'
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
app.setName('Aura Browser')
// The app was called "Aurora" before its first release: carry that profile over.
if (!process.env.AURORA_USER_DATA_DIR) migrateLegacyUserData()
app.setAboutPanelOptions({ applicationName: 'Aura Browser', applicationVersion: app.getVersion() })

let win: BrowserWindow | null = null
let manager: TabManager | null = null
let lastSpacesSignature = ''
let rebuildMenu: () => void = () => undefined
/** URLs the OS handed us before the window was ready. */
const pendingUrls: string[] = []
let openMiniWindows: (urls: string[]) => void = (urls) => pendingUrls.push(...urls)

/** http(s) arguments are how Windows and Linux hand a default browser a link. */
function urlsFromArgv(argv: readonly string[]): string[] {
  return argv.filter((arg) => /^https?:\/\//i.test(arg))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const urls = urlsFromArgv(argv)
    if (urls.length > 0) {
      openMiniWindows(urls)
      return
    }
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  // macOS delivers links to the default browser this way.
  app.on('open-url', (event, url) => {
    event.preventDefault()
    openMiniWindows([url])
  })

  openMiniWindows(urlsFromArgv(process.argv.slice(1)))

  app.on('window-all-closed', () => {
    app.quit()
  })

  let flushedForQuit = false
  app.on('before-quit', (event) => {
    manager?.saveSessionNow()
    if (flushedForQuit || !manager) return
    // Give every Space's cookie jar and storage a chance to hit disk, then quit
    // for real. Bounded so a stuck flush can never keep the app alive.
    flushedForQuit = true
    event.preventDefault()
    void Promise.race([
      manager.flushSessions(),
      new Promise<void>((resolve) => setTimeout(resolve, 1_500)),
    ]).then(() => app.quit())
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
  // The show-on-hover sidebar was replaced by the compact rail.
  if ((settings.sidebarMode as string) === 'hover') settings.sidebarMode = 'compact'

  // The theme setting drives prefers-color-scheme in every renderer via
  // nativeTheme — one pipe for system/light/dark. Set before window creation
  // so the first paint uses the right ground color.
  /** Keep the window buttons clear of the compact rail. */
  const applyTrafficLights = (): void => {
    if (process.platform !== 'darwin' || !win || win.isDestroyed()) return
    win.setWindowButtonPosition(
      settings.sidebarMode === 'compact'
        ? { ...TRAFFIC_LIGHTS.compact }
        : { ...TRAFFIC_LIGHTS.fixed },
    )
  }

  nativeTheme.themeSource = settings.theme
  nativeTheme.on('updated', () => {
    win?.setBackgroundColor(WINDOW_BG[nativeTheme.shouldUseDarkColors ? 'dark' : 'light'])
  })

  const downloads = new DownloadsService(db, DownloadsService.defaultDirectory(), (list) =>
    pushToChrome('downloads:changed', list),
  )
  const permissions = new PermissionService(kv, (request) =>
    pushToChrome('permissions:request', request),
  )
  const extensions = new ExtensionService(kv, (list) => pushToChrome('extensions:changed', list), {
    webStoreInstalls: () => settings.webStoreInstalls,
  })
  const displayCapture = new DisplayCaptureService(
    (request) => pushToChrome('displayCapture:request', request),
    (id) => pushToChrome('displayCapture:close', { id }),
  )
  const updater = new UpdaterService((state) => {
    pushToChrome('updates:state', state)
    // The Dock (macOS) / taskbar (Windows) icon shows the same download progress.
    if (win && !win.isDestroyed()) {
      win.setProgressBar(state.status === 'downloading' ? (state.percent ?? 0) / 100 : -1)
    }
  })

  const w = createChromeWindow()
  win = w
  const m = new TabManager(w, {
    history,
    archive,
    saveSession: (snapshot) => kv.set('session', snapshot),
    requestUrlEdit: () => pushToChrome('ui:command', { id: 'url:focus' }),
    stateEmitted: (snapshot) => {
      // The Spaces menu lists the real Spaces, so rebuild it when that list —
      // or which one is active — changes. Tab churn must not rebuild it.
      const signature = `${snapshot.activeSpaceId}|${snapshot.spaces.map((s) => `${s.id}:${s.name}`).join(',')}`
      if (signature === lastSpacesSignature) return
      lastSpacesSignature = signature
      rebuildMenu()
    },
    pushFindResult: (result) => pushToChrome('find:result', result),
    // Every Space is its own storage partition (ADR-0004); each session gets
    // download tracking and deny-by-default permissions the first time it is used.
    attachSession: (ses, { persist }) => {
      downloads.attach(ses)
      permissions.attach(ses, { persistDecisions: persist })
      displayCapture.attach(ses)
      void extensions.attach(ses)
    },
  })
  manager = m
  // The chrome renderer itself lives on the default session — harden it too.
  m.prepareSession(DEFAULT_PARTITION, true)

  setTrustedWebContents(w.webContents)

  // A URL handed to Aura Browser by another app opens in its own small window,
  // so a quick read never disturbs the Spaces and tabs in the main window.
  const miniWindows = new MiniWindowService({
    openInMain: (url, opts) => {
      m.create({ url, activate: true, title: opts.title, faviconUrl: opts.faviconUrl })
      if (!w.isDestroyed()) w.focus()
    },
    context: () => {
      const space = m.activeSpace()
      return space
        ? { partition: space.partition, incognito: space.incognito, spaceId: space.id }
        : null
    },
    recordVisit: (url) => history.recordVisit(url),
    updateTitle: (url, title) => history.updateTitle(url, title),
    pushState: (wc, info) => pushTo(wc, 'mini:state', info),
    trust: (wc) => addTrustedWebContents(wc),
  })
  openMiniWindows = (urls) => urls.forEach((url) => miniWindows.open(url))
  // Well before a page can ask to share, so the first request is not stuck
  // behind Chromium's capture-stack start-up.
  displayCapture.warmUp()

  registerIpcHandlers({
    manager: m,
    history,
    archive,
    downloads,
    permissions,
    displayCapture,
    miniWindows,
    extensions,
    updater,
    getSettings: () => settings,
    setSettings: (patch) => {
      settings = { ...settings, ...patch }
      kv.set('settings', settings)
      if ((settings.sidebarMode as string) === 'hover') settings.sidebarMode = 'compact'
      if (patch.sidebarMode !== undefined) applyTrafficLights()
      if (patch.theme !== undefined) nativeTheme.themeSource = settings.theme
      pushToChrome('settings:changed', settings)
      return settings
    },
    win: w,
  })
  const buildMenu = (): void =>
    installMenu({
      manager: m,
      getWindow: () => win,
      sendCommand: (id) => pushToChrome('ui:command', { id }),
      checkForUpdates: () => void updater.check(),
    })
  rebuildMenu = buildMenu
  buildMenu()
  applyTrafficLights()

  hardenChromeNavigation(w)
  forwardRendererCombos(w)

  // Restore only after the chrome renderer has painted: the shell appears
  // instantly, and no WebContentsView is created while automation harnesses
  // (Playwright's CDP handshake) are still attaching to the fresh process.
  w.webContents.once('did-finish-load', () => {
    restoreSession(kv, m)
    m.autoArchive(settings.todayArchiveHours)
    updater.start()
    // Anything the OS handed us at launch (default-browser click, or a URL on
    // the command line) opens now that a Space exists to borrow context from.
    const pending = pendingUrls.splice(0)
    openMiniWindows(pending)
  })

  setInterval(() => m.autoArchive(settings.todayArchiveHours), AUTO_ARCHIVE_SWEEP_MS)

  w.on('closed', () => {
    win = null
  })
}

function migrateLegacyUserData(): void {
  const current = app.getPath('userData')
  const legacy = join(dirname(current), 'Aurora')
  if (!existsSync(legacy)) return
  try {
    if (existsSync(current) && readdirSync(current).length > 0) return
    rmSync(current, { recursive: true, force: true })
    renameSync(legacy, current)
  } catch {
    // Start with a fresh profile rather than fail to launch.
  }
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
