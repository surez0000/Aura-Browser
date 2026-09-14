import { app, shell } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater'
import type { UpdateState } from '@shared/models'

const FIRST_CHECK_DELAY_MS = 15_000
const RECHECK_INTERVAL_MS = 6 * 60 * 60_000

/**
 * Auto-update via electron-updater. The main process owns the state machine
 * and pushes every transition to the chrome; the chrome only asks to check or
 * install. Nothing identifying leaves the machine: a check fetches a version
 * manifest (latest*.yml) from the release host configured in package.json.
 *
 * Constraints, surfaced in the UI rather than failing silently:
 *  - dev / unpackaged builds report 'unsupported';
 *  - macOS applies in-place updates only to code-signed apps (Squirrel.Mac
 *    validates the running app's signature) — an unsigned build reports
 *    'unsupported' with a link to the release page.
 */
export class UpdaterService {
  private state: UpdateState
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly push: (state: UpdateState) => void) {
    const pkg = readPackageJson()
    const releasesUrl = releasesUrlFrom(pkg)
    const supported = app.isPackaged && releasesUrl !== null
    this.state = {
      status: supported ? 'idle' : 'unsupported',
      currentVersion: pkg?.version ?? app.getVersion(),
      availableVersion: null,
      percent: null,
      message: supported
        ? null
        : app.isPackaged
          ? 'No update source is configured for this build (build.publish in package.json).'
          : 'Updates apply to installed builds only.',
      releasesUrl,
      checkedAt: null,
    }
    if (!supported) return

    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.logger = null
    autoUpdater.on('checking-for-update', () => this.set({ status: 'checking', message: null }))
    autoUpdater.on('update-available', (info: UpdateInfo) =>
      this.set({ status: 'available', availableVersion: info.version, percent: 0 }),
    )
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
  }

  get(): UpdateState {
    return this.state
  }

  /** Periodic checks for installed builds; a no-op in development. */
  start(): void {
    if (this.state.status === 'unsupported' || this.timer) return
    setTimeout(() => void this.check(), FIRST_CHECK_DELAY_MS).unref()
    this.timer = setInterval(() => void this.check(), RECHECK_INTERVAL_MS)
    this.timer.unref()
  }

  async check(): Promise<UpdateState> {
    if (['unsupported', 'checking', 'downloading', 'ready'].includes(this.state.status)) {
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
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
  }

  openReleases(): void {
    if (this.state.releasesUrl) void shell.openExternal(this.state.releasesUrl)
  }

  private set(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch }
    this.push(this.state)
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
    } else if (text) {
      message = `Update check failed: ${text.split('\n')[0]?.slice(0, 140) ?? ''}`
    }
    this.set({ status: 'error', percent: null, message, checkedAt: Date.now() })
  }
}

interface PublishConfig {
  provider?: string
  owner?: string
  repo?: string
  url?: string
}

interface PackageJson {
  name?: string
  version?: string
  build?: { publish?: PublishConfig | PublishConfig[] }
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
 * The release page derives from electron-builder's publish config — one source
 * of truth for where builds live. The scaffold placeholder counts as "not
 * configured" so the app never checks against a repository that isn't ours.
 */
function releasesUrlFrom(pkg: PackageJson | null): string | null {
  const raw = pkg?.build?.publish
  const publish = Array.isArray(raw) ? raw[0] : raw
  if (!publish) return null
  if (publish.provider === 'github') {
    if (!publish.owner || !publish.repo || publish.owner === 'CHANGE_ME') return null
    return `https://github.com/${publish.owner}/${publish.repo}/releases`
  }
  return publish.url ?? null
}
