import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { isDev } from '../env'

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
    backgroundColor: '#0c0e1a',
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 13 } }
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
