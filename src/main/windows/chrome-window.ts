import { BrowserWindow, nativeTheme, screen } from 'electron'
import { join } from 'node:path'
import { WINDOW_BG } from '@shared/theme'
import { isDev } from '../env'

/**
 * Where macOS draws the window buttons. They are about 52 px wide, so in the
 * compact rail (60 px) they have to start nearer the edge or the last one
 * spills onto the page.
 */
export const TRAFFIC_LIGHTS = {
  fixed: { x: 14, y: 13 },
  compact: { x: 4, y: 13 },
} as const

/** Where the window was last left. Persisted so it reopens as you had it. */
export interface WindowPlacement {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
  fullScreen: boolean
}

const DEFAULT_SIZE = { width: 1360, height: 860 }
/** How long to wait after the last drag/resize event before saving. */
const SAVE_DEBOUNCE_MS = 400

/**
 * Keep a remembered position only if it still lands on a connected display.
 * Unplugging a monitor would otherwise reopen the window off-screen.
 */
function onScreen(placement: WindowPlacement): boolean {
  if (placement.x === undefined || placement.y === undefined) return false
  // A window is reachable if its title area overlaps some display's work area.
  return screen.getAllDisplays().some(({ workArea }) => {
    const left = Math.max(workArea.x, placement.x!)
    const right = Math.min(workArea.x + workArea.width, placement.x! + placement.width)
    const top = Math.max(workArea.y, placement.y!)
    const bottom = Math.min(workArea.y + workArea.height, placement.y! + 60)
    return right - left > 80 && bottom - top > 8
  })
}

/**
 * The frameless shell window. Deliberately opaque (ADR-0002): the aurora
 * backdrop is painted by the chrome renderer itself, so the theme looks the
 * same on every OS and never depends on compositor transparency.
 *
 * Size, position and the maximized/full-screen state are restored from the
 * last run: the window used to open at a fixed size however it was left.
 */
export function createChromeWindow(opts: {
  placement: WindowPlacement | null
  onPlacementChanged: (placement: WindowPlacement) => void
}): BrowserWindow {
  const saved = opts.placement && onScreen(opts.placement) ? opts.placement : null
  const win = new BrowserWindow({
    width: saved?.width ?? DEFAULT_SIZE.width,
    height: saved?.height ?? DEFAULT_SIZE.height,
    ...(saved?.x !== undefined && saved.y !== undefined ? { x: saved.x, y: saved.y } : {}),
    minWidth: 800,
    minHeight: 520,
    show: false,
    backgroundColor: WINDOW_BG[nativeTheme.shouldUseDarkColors ? 'dark' : 'light'],
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: TRAFFIC_LIGHTS.fixed }
      : { frame: false as const }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.once('ready-to-show', () => {
    // Restore these after the frame exists: setting them in the constructor
    // fights the remembered normal-size bounds we want to keep underneath.
    if (opts.placement?.maximized) win.maximize()
    if (opts.placement?.fullScreen) win.setFullScreen(true)
    win.show()
  })

  // Remember the *restored* size, not the maximized frame, so unmaximizing
  // later gives back the size the user actually chose.
  let timer: ReturnType<typeof setTimeout> | null = null
  const remember = (): void => {
    if (win.isDestroyed()) return
    const normal = win.getNormalBounds()
    opts.onPlacementChanged({
      x: normal.x,
      y: normal.y,
      width: normal.width,
      height: normal.height,
      maximized: win.isMaximized(),
      fullScreen: win.isFullScreen(),
    })
  }
  const scheduleRemember = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(remember, SAVE_DEBOUNCE_MS)
  }
  win.on('resize', scheduleRemember)
  win.on('move', scheduleRemember)
  win.on('maximize', remember)
  win.on('unmaximize', remember)
  win.on('enter-full-screen', remember)
  win.on('leave-full-screen', remember)
  win.on('close', () => {
    if (timer) clearTimeout(timer)
    remember()
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (isDev && devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}
