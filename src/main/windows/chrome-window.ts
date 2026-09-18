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

/** A display's usable rectangle, as Electron reports it. */
export interface WorkArea {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Pull a remembered placement back onto a connected display, keeping as much
 * of its size as fits. The window can legitimately be left somewhere it cannot
 * reopen — dragged partly above the menu bar, or on a monitor that has since
 * been unplugged — and the size is worth keeping even then, so this nudges
 * rather than discards. Pure, so it can be tested without a display.
 */
export function clampToWorkArea(
  placement: WindowPlacement,
  areas: readonly WorkArea[],
): WindowPlacement {
  if (placement.x === undefined || placement.y === undefined || areas.length === 0) return placement
  // The display holding most of the window, falling back to the first.
  const overlap = (area: WorkArea): number =>
    Math.max(
      0,
      Math.min(area.x + area.width, placement.x! + placement.width) -
        Math.max(area.x, placement.x!),
    ) *
    Math.max(
      0,
      Math.min(area.y + area.height, placement.y! + placement.height) -
        Math.max(area.y, placement.y!),
    )
  const area = areas.reduce(
    (best, next) => (overlap(next) > overlap(best) ? next : best),
    areas[0]!,
  )

  const width = Math.min(placement.width, area.width)
  const height = Math.min(placement.height, area.height)
  return {
    ...placement,
    width,
    height,
    x: Math.min(Math.max(placement.x, area.x), area.x + area.width - width),
    y: Math.min(Math.max(placement.y, area.y), area.y + area.height - height),
  }
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
  const saved = opts.placement
    ? clampToWorkArea(
        opts.placement,
        screen.getAllDisplays().map(({ workArea }) => workArea),
      )
    : null
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
