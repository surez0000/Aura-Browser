// Renders build/icon.svg to build/icon.png (1024², transparent) with Electron's
// offscreen renderer, so the app icon needs no extra tooling. electron-builder
// derives .icns / .ico / Linux PNGs from this file. Run: npm run icon
const { app, BrowserWindow } = require('electron')
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const root = join(__dirname, '..')
const SIZE = 1024

app.whenReady().then(async () => {
  mkdirSync(join(root, 'build'), { recursive: true })
  const svg = readFileSync(join(root, 'build', 'icon.svg'), 'utf8')
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    transparent: true,
    useContentSize: true,
    webPreferences: { offscreen: true },
  })
  const html = `<!doctype html><html><body style="margin:0;background:transparent;width:${SIZE}px;height:${SIZE}px;overflow:hidden">${svg}</body></html>`
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise((resolve) => setTimeout(resolve, 600))
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE })
  writeFileSync(join(root, 'build', 'icon.png'), image.toPNG())
  console.log('wrote build/icon.png', image.getSize())
  app.quit()
})
