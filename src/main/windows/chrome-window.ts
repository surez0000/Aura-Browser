import { BrowserWindow, nativeTheme } from 'electron'
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

/**
 * The frameless shell window. Deliberately opaque (ADR-0002): the aurora
 * backdrop is painted by the chrome renderer itself, so the theme looks the
 * same on every OS and never depends on compositor transparency.
 */
export function createChromeWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
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

  win.once('ready-to-show', () => win.show())

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (isDev && devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}
