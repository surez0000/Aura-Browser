// Builds build/icon.png (1024², transparent margins) from build/logo.png with
// Electron's offscreen renderer: the logo sits on a white rounded tile using
// the macOS icon grid (824 px tile, 186 px corner radius). electron-builder
// derives .icns / .ico / Linux PNGs from the result. Run: npm run icon
const { app, BrowserWindow, nativeImage } = require('electron')
const { existsSync, readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const root = join(__dirname, '..')
const SIZE = 1024
const TILE = 824
const INSET = (SIZE - TILE) / 2
const RADIUS = 186

app.whenReady().then(async () => {
  const logoPath = join(root, 'build', 'logo.png')
  if (!existsSync(logoPath)) {
    console.error('build/logo.png is missing — drop the square logo there first.')
    app.exit(2)
    return
  }
  const logo = `data:image/png;base64,${readFileSync(logoPath).toString('base64')}`
  const html = `<!doctype html><html><body style="margin:0;background:transparent;width:${SIZE}px;height:${SIZE}px;overflow:hidden">
    <div style="position:absolute;left:${INSET}px;top:${INSET}px;width:${TILE}px;height:${TILE}px;border-radius:${RADIUS}px;background:#ffffff;overflow:hidden;box-shadow:inset 0 0 0 3px rgba(0,0,0,0.06)">
      <img src="${logo}" style="width:100%;height:100%;object-fit:cover;display:block" />
    </div>
  </body></html>`

  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    transparent: true,
    useContentSize: true,
    webPreferences: { offscreen: true },
  })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise((resolve) => setTimeout(resolve, 600))
  const captured = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE })
  // Retina displays capture at 2×; normalise to exactly 1024².
  const image =
    captured.getSize().width === SIZE
      ? captured
      : nativeImage
          .createFromBuffer(captured.toPNG())
          .resize({ width: SIZE, height: SIZE, quality: 'best' })
  writeFileSync(join(root, 'build', 'icon.png'), image.toPNG())
  console.log('wrote build/icon.png', image.getSize())
  app.quit()
})
