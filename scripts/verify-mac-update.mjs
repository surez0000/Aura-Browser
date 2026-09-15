// End-to-end check of the macOS self-update path used by unsigned builds:
// install a copy of the packaged app into a temp "Applications", publish a
// fake newer release on a local server, and watch the app download, verify,
// swap its own bundle, and relaunch. Needs `npm run dist` first.
// Run: node scripts/verify-mac-update.mjs
import { _electron } from 'playwright'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
const { productName, version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const appName = `${productName}.app`
const exe = ['Contents', 'MacOS', productName]
const distApp = [
  join(root, 'dist', `mac-${arch}`, appName),
  join(root, 'dist', 'mac', appName),
].find((p) => existsSync(p))
if (!distApp) {
  console.error(`No packaged ${appName} found under dist/. Run \`npm run dist\` first.`)
  process.exit(2)
}

const T = mkdtempSync(join(tmpdir(), 'aura-update-'))
const log = (...a) => console.log('[verify-mac-update]', ...a)
let server
let app
try {
  // 1. "Install" the current build.
  const installed = join(T, 'Applications', appName)
  mkdirSync(join(T, 'Applications'), { recursive: true })
  execFileSync('/usr/bin/ditto', [distApp, installed])

  // 2. Fabricate the next version: same build + a marker file.
  const [maj, min, pat] = version.split('.').map(Number)
  const next = `${maj}.${min}.${pat + 1}`
  const newApp = join(T, 'new', appName)
  mkdirSync(join(T, 'new'), { recursive: true })
  execFileSync('/usr/bin/ditto', [distApp, newApp])
  writeFileSync(join(newApp, 'Contents', 'Resources', 'UPDATED-MARKER'), next)

  const feed = join(T, 'feed')
  mkdirSync(feed)
  const zipName = `AuraBrowser-${next}-mac-${arch}.zip`
  const zipPath = join(feed, zipName)
  log('zipping fake release', zipName)
  execFileSync('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', newApp, zipPath])
  const sha512 = createHash('sha512').update(readFileSync(zipPath)).digest('base64')
  const size = statSync(zipPath).size
  writeFileSync(
    join(feed, 'latest-mac.yml'),
    `version: ${next}\nfiles:\n  - url: ${zipName}\n    sha512: ${sha512}\n    size: ${size}\npath: ${zipName}\nsha512: ${sha512}\nreleaseDate: '${new Date().toISOString()}'\n`,
  )

  // 3. Serve it and point the installed copy at the local feed.
  server = createServer((req, res) => {
    const file = join(feed, decodeURIComponent((req.url ?? '/').split('?')[0].slice(1)))
    if (!existsSync(file)) {
      res.writeHead(404)
      res.end()
      return
    }
    res.writeHead(200, { 'content-length': statSync(file).size })
    createReadStream(file).pipe(res)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  writeFileSync(
    join(installed, 'Contents', 'Resources', 'app-update.yml'),
    `provider: generic\nurl: http://127.0.0.1:${port}/\nupdaterCacheDirName: aura-browser-updater\n`,
  )

  // 4. Launch, check, wait for "ready", click Restart to update.
  app = await _electron.launch({
    executablePath: join(installed, ...exe),
    args: [],
    env: { ...process.env, AURORA_USER_DATA_DIR: join(T, 'userData') },
  })
  const chrome = await app.firstWindow()
  await chrome.waitForSelector('[data-testid="sidebar"]')
  await chrome.keyboard.press('Meta+,')
  await chrome.getByTestId('settings-flyout').waitFor()
  log('status:', await chrome.getByTestId('updates-status').textContent())
  await chrome.getByTestId('updates-check').click()
  // The prominent card in the sidebar must appear on its own while downloading…
  await chrome.getByTestId('update-card').waitFor({ timeout: 60_000 })
  log('card:', await chrome.getByTestId('update-card').getAttribute('data-kind'))
  await chrome.getByTestId('updates-install').waitFor({ timeout: 180_000 })
  log('status:', await chrome.getByTestId('updates-status').textContent())
  // …and offer the one-click install once ready.
  const cardKind = await chrome.getByTestId('update-card').getAttribute('data-kind')
  if (cardKind !== 'ready') throw new Error(`update card should be ready, was ${cardKind}`)
  log('card:', cardKind, '| Restart buttons:', await chrome.getByTestId('update-ready').count())

  const exited = new Promise((r) => app.process().once('exit', r))
  await chrome.getByTestId('updates-install').click()
  await exited
  log('old process exited; waiting for the relaunch')
  await new Promise((r) => setTimeout(r, 5000))

  // 5. Judge: swapped bundle + a fresh process from the same path.
  const marker = existsSync(join(installed, 'Contents', 'Resources', 'UPDATED-MARKER'))
  let pids = ''
  try {
    pids = execFileSync('/usr/bin/pgrep', ['-f', join(installed, ...exe)])
      .toString()
      .trim()
  } catch {
    pids = ''
  }
  const previousLeft = existsSync(join(T, 'Applications', `.${appName}.previous`))
  log(
    'marker present:',
    marker,
    '| relaunched pids:',
    pids || 'none',
    '| previous kept for cleanup:',
    previousLeft,
  )
  if (pids) execFileSync('/bin/kill', pids.split('\n'))
  const ok = marker && pids.length > 0
  log(ok ? 'PASS — the app replaced its own bundle and relaunched' : 'FAIL')
  process.exitCode = ok ? 0 : 1
} finally {
  server?.close()
  try {
    await app?.close()
  } catch {
    // already exited
  }
  rmSync(T, { recursive: true, force: true })
}
