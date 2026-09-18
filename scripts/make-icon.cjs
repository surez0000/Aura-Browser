// Builds build/icon.png (1024², transparent margins) from build/logo.png with
// Electron's offscreen renderer: the artwork is clipped to a rounded tile on
// the macOS icon grid (824 px tile, 186 px corner radius) and keeps its own
// background, so a logo that already carries one is not boxed inside a second
// one. electron-builder derives .icns / .ico / Linux PNGs from the result.
// Run: npm run icon
const { app, BrowserWindow, nativeImage } = require('electron')
const { existsSync, rmSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')

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
  // Reference the file directly: a multi-megabyte data: URL makes loadURL crawl.
  const logo = 'file://' + encodeURI(logoPath)
  const html = `<!doctype html><html><body style="margin:0;background:transparent;width:${SIZE}px;height:${SIZE}px;overflow:hidden">
    <div style="position:absolute;left:${INSET}px;top:${INSET}px;width:${TILE}px;height:${TILE}px;border-radius:${RADIUS}px;overflow:hidden;box-shadow:inset 0 0 0 2px rgba(255,255,255,0.10)">
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
  const htmlFile = join(tmpdir(), `aura-icon-${process.pid}.html`)
  writeFileSync(htmlFile, html)
  await win.loadURL('file://' + encodeURI(htmlFile))
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
  rmSync(htmlFile, { force: true })
  console.log('wrote build/icon.png', image.getSize())
  app.quit()
})
