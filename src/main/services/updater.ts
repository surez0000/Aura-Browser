import { app, net, shell } from 'electron'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  accessSync,
  constants,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater'
import type { UpdateState } from '@shared/models'
import {
  assetUrl,
  bundleIdFromPlist,
  classifyCodesign,
  macBundleFromExe,
  parseUpdateYaml,
  pickMacZip,
  releasesPageUrl,
  type UpdateConfig,
} from './update-assets'

const execFileAsync = promisify(execFile)

const FIRST_CHECK_DELAY_MS = 15_000
const RECHECK_INTERVAL_MS = 6 * 60 * 60_000

/**
 * How an installed copy gets from "a newer release exists" to running it:
 *  - native   — electron-updater downloads and installs (Windows NSIS, Linux
 *               AppImage, and macOS *when the app is Developer-ID signed*).
 *  - mac-swap — macOS without a signing certificate. Squirrel.Mac refuses to
 *               update ad-hoc/unsigned apps, so Aurora does it itself: fetch
 *               the release zip, verify its SHA-512 from the manifest, unpack
 *               with ditto, check the bundle id, swap the .app in place, and
 *               relaunch. The new bundle was never quarantined (Node fetched
 *               it, not a browser), so Gatekeeper does not prompt again.
 *  - none     — dev builds, no publish target, or a copy that cannot replace
 *               itself (running from a disk image, read-only folder).
 */
type Strategy = 'native' | 'mac-swap' | 'none'

/**
 * Auto-update. The main process owns the state machine and pushes every
 * transition to the chrome; the chrome only asks to check or install. Nothing
 * identifying leaves the machine: a check fetches a version manifest
 * (latest*.yml) from the release host configured at build time.
 */
export class UpdaterService {
  private state: UpdateState
  private strategy: Strategy = 'none'
  private readonly ready: Promise<void>
  private readonly config: UpdateConfig | null
  private readonly updatesDir = join(app.getPath('userData'), 'updates')
  private pendingZip: { path: string; version: string } | null = null
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly push: (state: UpdateState) => void) {
    this.config = readUpdateConfig()
    const releasesUrl = releasesPageUrl(this.config)
    this.state = {
      status: 'idle',
      currentVersion: readPackageJson()?.version ?? app.getVersion(),
      availableVersion: null,
      percent: null,
      message: null,
      releasesUrl,
      checkedAt: null,
    }

    if (!app.isPackaged) {
      this.unsupported('Updates apply to installed builds only.')
      this.ready = Promise.resolve()
      return
    }
    if (!releasesUrl) {
      this.unsupported(
        'No update source is configured for this build (build.publish in package.json).',
      )
      this.ready = Promise.resolve()
      return
    }

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.logger = null
    autoUpdater.on('checking-for-update', () => this.set({ status: 'checking', message: null }))
    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.set({ status: 'available', availableVersion: info.version, percent: 0 })
      if (this.strategy === 'mac-swap') void this.downloadForSwap(info)
    })
    autoUpdater.on('update-not-available', () =>
      this.set({
        status: 'up-to-date',
        availableVersion: null,
        percent: null,
        checkedAt: Date.now(),
      }),
    )
    autoUpdater.on('download-progress', (progress: ProgressInfo) =>
      this.set({ status: 'downloading', percent: Math.round(progress.percent) }),
    )
    autoUpdater.on('update-downloaded', (info: UpdateInfo) =>
      this.set({
        status: 'ready',
        availableVersion: info.version,
        percent: 100,
        checkedAt: Date.now(),
      }),
    )
    autoUpdater.on('error', (error: Error) => this.fail(error))

    this.ready = this.decideStrategy()
  }

  get(): UpdateState {
    return this.state
  }

  /** Periodic checks for installed builds; a no-op when unsupported. */
  start(): void {
    this.cleanupPreviousInstall()
    void this.ready.then(() => {
      if (this.strategy === 'none' || this.timer) return
      setTimeout(() => void this.check(), FIRST_CHECK_DELAY_MS).unref()
      this.timer = setInterval(() => void this.check(), RECHECK_INTERVAL_MS)
      this.timer.unref()
    })
  }

  async check(): Promise<UpdateState> {
    await this.ready
    if (
      this.strategy === 'none' ||
      ['checking', 'downloading', 'ready'].includes(this.state.status)
    ) {
      return this.state
    }
    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      this.fail(error)
    }
    return this.state
  }

  /** One click: quit, install the downloaded update, relaunch. */
  install(): void {
    if (this.state.status !== 'ready') return
    if (this.strategy === 'native') {
      setImmediate(() => autoUpdater.quitAndInstall(false, true))
    } else if (this.strategy === 'mac-swap' && this.pendingZip) {
      void this.installMacSwap(this.pendingZip.path)
    }
  }

  openReleases(): void {
    if (this.state.releasesUrl) void shell.openExternal(this.state.releasesUrl)
  }

  // ---- strategy -----------------------------------------------------------

  private async decideStrategy(): Promise<void> {
    if (process.platform !== 'darwin') {
      this.strategy = 'native'
      autoUpdater.autoDownload = true
      autoUpdater.autoInstallOnAppQuit = true
      return
    }
    const bundle = macBundleFromExe(app.getPath('exe'))
    const signature = bundle ? classifyCodesign(await codesignOutput(bundle)) : 'unknown'
    if (signature === 'developer-id') {
      this.strategy = 'native'
      autoUpdater.autoDownload = true
      autoUpdater.autoInstallOnAppQuit = true
      return
    }
    if (!bundle) {
      this.unsupported(
        'Aurora is running from a disk image or outside an app bundle. Drag it into Applications to enable updates.',
      )
      return
    }
    if (!isWritable(dirname(bundle)) || !isWritable(bundle)) {
      this.unsupported(
        "Aurora's folder is read-only, so it cannot replace itself. Download new versions from the release page.",
      )
      return
    }
    this.strategy = 'mac-swap'
  }

  // ---- mac-swap: download -------------------------------------------------

  private async downloadForSwap(info: UpdateInfo): Promise<void> {
    try {
      const file = pickMacZip(info.files, process.arch)
      if (!file || !this.config) throw new Error('This release has no macOS package.')
      const url = assetUrl(this.config, info.version, file.url)
      if (!url) throw new Error('Could not resolve the download URL.')
      const dest = join(this.updatesDir, 'downloads', basename(file.url))
      this.set({ status: 'downloading', percent: 0, availableVersion: info.version })
      if (!(existsSync(dest) && (await sha512Of(dest)) === file.sha512)) {
        await downloadFile(url, dest, file.sha512, (percent) => {
          if (percent !== this.state.percent) this.set({ status: 'downloading', percent })
        })
      }
      this.pendingZip = { path: dest, version: info.version }
      this.set({ status: 'ready', percent: 100, checkedAt: Date.now() })
    } catch (error) {
      this.fail(error)
    }
  }

  // ---- mac-swap: install --------------------------------------------------

  private async installMacSwap(zipPath: string): Promise<void> {
    const bundle = macBundleFromExe(app.getPath('exe'))
    if (!bundle) return
    const staging = join(this.updatesDir, 'staging')
    const previous = join(dirname(bundle), `.${basename(bundle)}.previous`)
    try {
      rmSync(staging, { recursive: true, force: true })
      mkdirSync(staging, { recursive: true })
      await execFileAsync('/usr/bin/ditto', ['-x', '-k', zipPath, staging])

      const newApp = readdirSync(staging)
        .map((name) => join(staging, name))
        .find((path) => path.endsWith('.app'))
      if (!newApp) throw new Error('the package did not contain an app bundle')

      const ours = bundleIdFromPlist(readFileSync(join(bundle, 'Contents', 'Info.plist'), 'utf8'))
      const theirs = bundleIdFromPlist(readFileSync(join(newApp, 'Contents', 'Info.plist'), 'utf8'))
      if (!ours || ours !== theirs) throw new Error('the package is not Aurora')

      await execFileAsync('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', newApp]).catch(
        () => undefined,
      )

      rmSync(previous, { recursive: true, force: true })
      renameSync(bundle, previous)
      try {
        renameSync(newApp, bundle)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EXDEV') {
          renameSync(previous, bundle)
          throw error
        }
        await execFileAsync('/usr/bin/ditto', [newApp, bundle])
      }

      mkdirSync(this.updatesDir, { recursive: true })
      writeFileSync(
        join(this.updatesDir, 'cleanup.json'),
        JSON.stringify({ paths: [previous, staging, zipPath] }),
      )
      app.relaunch()
      app.quit()
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      this.set({
        status: 'error',
        message: `Could not install the update automatically (${reason}). Download it from the release page.`,
      })
    }
  }

  /** Remove what the previous swap left behind (runs on the next launch). */
  private cleanupPreviousInstall(): void {
    const file = join(this.updatesDir, 'cleanup.json')
    if (!existsSync(file)) return
    try {
      const { paths } = JSON.parse(readFileSync(file, 'utf8')) as { paths: string[] }
      for (const path of paths) rmSync(path, { recursive: true, force: true })
    } catch {
      // best effort
    }
    rmSync(file, { force: true })
  }

  // ---- state --------------------------------------------------------------

  private set(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch }
    this.push(this.state)
  }

  private unsupported(message: string): void {
    this.strategy = 'none'
    this.set({ status: 'unsupported', percent: null, message })
  }

  private fail(error: unknown): void {
    const text = error instanceof Error ? error.message : String(error)
    if (/code signature|not signed|codesign/i.test(text)) {
      this.set({
        status: 'unsupported',
        percent: null,
        checkedAt: Date.now(),
        message:
          'This build is not code-signed, so macOS cannot update it in place. Download the new version from the release page.',
      })
      return
    }
    let message = 'Update check failed.'
    if (/enotfound|econn|etimedout|net::|network/i.test(text)) {
      message = 'Could not reach the update server.'
    } else if (/404|not found|no published versions|cannot find latest|latest.*\.yml/i.test(text)) {
      message = 'No release has been published yet.'
    } else if (/checksum/i.test(text)) {
      message = 'The downloaded update failed its checksum and was discarded.'
    } else if (text) {
      message = `Update check failed: ${text.split('\n')[0]?.slice(0, 140) ?? ''}`
    }
    this.set({ status: 'error', percent: null, message, checkedAt: Date.now() })
  }
}

// ---- helpers ----------------------------------------------------------------

interface PackageJson {
  name?: string
  version?: string
  build?: { publish?: UpdateConfig | UpdateConfig[] }
}

/**
 * Aurora's own package.json: inside the asar when packaged; in development the
 * app path is `out/main`, so walk to the project root instead.
 */
function readPackageJson(): PackageJson | null {
  const candidates = [
    join(app.getAppPath(), 'package.json'),
    join(__dirname, '..', '..', 'package.json'),
    join(process.cwd(), 'package.json'),
  ]
  for (const file of candidates) {
    try {
      if (!existsSync(file)) continue
      const pkg = JSON.parse(readFileSync(file, 'utf8')) as PackageJson
      if (pkg.name === 'aurora') return pkg
    } catch {
      // try the next candidate
    }
  }
  return null
}

/**
 * The publish target: electron-builder writes it to `app-update.yml` next to
 * the app when packaging (the same file electron-updater reads), and it lives
 * in package.json `build.publish` in development — one source of truth.
 */
function readUpdateConfig(): UpdateConfig | null {
  if (app.isPackaged) {
    try {
      const yaml = readFileSync(join(process.resourcesPath, 'app-update.yml'), 'utf8')
      const parsed = parseUpdateYaml(yaml)
      if (parsed) return parsed
    } catch {
      // fall through to package.json
    }
  }
  const raw = readPackageJson()?.build?.publish
  return (Array.isArray(raw) ? raw[0] : raw) ?? null
}

async function codesignOutput(bundle: string): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync('/usr/bin/codesign', ['-dv', bundle])
    return `${stdout}\n${stderr}`
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; message?: string }
    return `${e.stdout ?? ''}\n${e.stderr ?? ''}\n${e.message ?? ''}`
  }
}

function isWritable(path: string): boolean {
  try {
    accessSync(path, constants.W_OK)
    return true
  } catch {
    return false
  }
}

function sha512Of(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha512')
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('base64')))
      .on('error', reject)
  })
}

/** Stream a release asset to disk, verifying its SHA-512 (base64, as in latest*.yml). */
function downloadFile(
  url: string,
  dest: string,
  expectedSha512: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    mkdirSync(dirname(dest), { recursive: true })
    const partial = `${dest}.part`
    const request = net.request({ url, redirect: 'follow' })
    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode} while downloading the update`))
        return
      }
      const lengthHeader = response.headers['content-length']
      const total = Number(Array.isArray(lengthHeader) ? lengthHeader[0] : lengthHeader) || 0
      const hash = createHash('sha512')
      const out = createWriteStream(partial)
      // Electron documents IncomingMessage as a Readable stream; its typings
      // omit pause/resume, which we need for backpressure on a 150 MB body.
      const stream = response as unknown as NodeJS.ReadableStream
      let received = 0
      response.on('data', (chunk: Buffer) => {
        hash.update(chunk)
        received += chunk.length
        if (total) onProgress(Math.min(99, Math.floor((received / total) * 100)))
        if (!out.write(chunk)) {
          stream.pause()
          out.once('drain', () => stream.resume())
        }
      })
      response.on('end', () => {
        out.end(() => {
          if (hash.digest('base64') !== expectedSha512) {
            rmSync(partial, { force: true })
            reject(new Error('checksum mismatch'))
            return
          }
          renameSync(partial, dest)
          resolve()
        })
      })
      response.on('error', (error: Error) => {
        out.destroy()
        rmSync(partial, { force: true })
        reject(error)
      })
    })
    request.on('error', reject)
    request.end()
  })
}
