import { app, dialog, shell, type Session } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  installChromeWebStore,
  loadAllExtensions,
  uninstallExtension,
  updateExtensions,
} from 'electron-chrome-web-store'
import type { ExtensionInfo } from '@shared/models'
import type { KvStore } from './db/kv'

const KV_KEY = 'extensions'

/** `AURORA_LOAD_EXTENSION=/path/one,/path/two` — unpacked, for this run only. */
function developerExtensionPaths(): string[] {
  return (process.env.AURORA_LOAD_EXTENSION ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
}
const STORE_URL = 'https://chromewebstore.google.com/'

interface StoredExtension {
  name: string
  version: string
  /** Disabled extensions stay installed on disk but are not loaded. */
  disabled?: boolean
  /** Set for extensions loaded from a folder rather than the web store. */
  unpackedPath?: string
}

/**
 * Chrome extensions, on Electron's own extension support.
 *
 * Extensions are installed once and loaded into **every** Space, because they
 * are part of how the browser behaves rather than part of an identity. Their
 * storage is still per-Space, since each Space is its own session — so an
 * extension's settings do not leak between them.
 *
 * Installing from the Chrome Web Store is opt-in: that integration registers a
 * preload script on the session, which would otherwise apply to every page.
 * With it off, extensions already on disk still load, and folders can still be
 * added by hand.
 */
export class ExtensionService {
  private readonly sessions = new Set<Session>()
  private stored: Record<string, StoredExtension>
  readonly extensionsPath = join(app.getPath('userData'), 'Extensions')

  constructor(
    private readonly kv: KvStore,
    private readonly push: (list: ExtensionInfo[]) => void,
    private readonly opts: { webStoreInstalls: () => boolean },
  ) {
    this.stored = kv.get<Record<string, StoredExtension>>(KV_KEY) ?? {}
  }

  /** Load this Space's session with everything installed and enabled. */
  async attach(session: Session): Promise<void> {
    this.sessions.add(session)
    try {
      if (this.opts.webStoreInstalls()) {
        await installChromeWebStore({
          session,
          extensionsPath: this.extensionsPath,
          loadExtensions: true,
          allowUnpackedExtensions: true,
          autoUpdate: true,
          beforeInstall: async (details) => {
            const permissions = [
              ...((details.manifest.permissions as string[] | undefined) ?? []),
              ...((details.manifest.host_permissions as string[] | undefined) ?? []),
            ]
            const { response } = await dialog.showMessageBox({
              type: 'warning',
              buttons: ['Cancel', 'Add extension'],
              defaultId: 0,
              cancelId: 0,
              title: 'Add extension',
              message: `Add “${details.localizedName}” to Aura Browser?`,
              detail:
                (permissions.length
                  ? `It will be able to: ${permissions.slice(0, 12).join(', ')}.\n\n`
                  : '') +
                'Extensions run in every Space and can read the pages you visit. Only add ones you trust.',
            })
            return { action: response === 1 ? 'allow' : 'deny' }
          },
        })
      } else {
        await loadAllExtensions(session, this.extensionsPath, { allowUnpacked: true })
      }
      for (const [path] of this.unpackedPaths()) await this.loadUnpacked(session, path)
      // Developer flag, like Chrome's --load-extension: paths given here are
      // loaded for this run only and never written to the installed list.
      for (const path of developerExtensionPaths()) await this.loadUnpacked(session, path)
      this.applyDisabled(session)
    } catch {
      // A bad extension must never stop a Space from opening.
    }
    this.remember(session)
  }

  list(): ExtensionInfo[] {
    const session = this.primary()
    const loaded = session ? session.extensions.getAllExtensions() : []
    const byId = new Map(loaded.map((e) => [e.id, e]))
    const ids = new Set([...byId.keys(), ...Object.keys(this.stored)])
    return [...ids]
      .map((id) => {
        const live = byId.get(id)
        const record = this.stored[id]
        return {
          id,
          name: live?.name ?? record?.name ?? id,
          version: live?.version ?? record?.version ?? '',
          enabled: !!live,
          unpacked: !!record?.unpackedPath,
          iconDataUrl: live ? this.iconFor(live.path, live.manifest) : null,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    const record = this.stored[id]
    if (record) record.disabled = !enabled
    this.persist()
    for (const session of this.live()) {
      const loaded = session.extensions.getExtension(id)
      if (enabled && !loaded) {
        const path = record?.unpackedPath ?? this.storePathFor(session, id)
        if (path && existsSync(path)) {
          await session.extensions.loadExtension(path, { allowFileAccess: true }).catch(() => null)
        }
      } else if (!enabled && loaded) {
        session.extensions.removeExtension(id)
      }
    }
    this.emit()
  }

  async remove(id: string): Promise<void> {
    const record = this.stored[id]
    for (const session of this.live()) {
      if (session.extensions.getExtension(id)) session.extensions.removeExtension(id)
    }
    if (!record?.unpackedPath) {
      const session = this.primary()
      if (session) {
        await uninstallExtension(id, { session, extensionsPath: this.extensionsPath }).catch(
          () => undefined,
        )
      }
    }
    delete this.stored[id]
    this.persist()
    this.emit()
  }

  /** Add an extension from a folder (an unpacked build). */
  async addUnpacked(): Promise<void> {
    const picked = await dialog.showOpenDialog({
      title: 'Add extension from folder',
      properties: ['openDirectory'],
      message: 'Choose a folder containing a manifest.json',
    })
    const dir = picked.filePaths[0]
    if (picked.canceled || !dir) return
    if (!existsSync(join(dir, 'manifest.json'))) {
      await dialog.showMessageBox({
        type: 'error',
        title: 'Not an extension',
        message: 'That folder has no manifest.json.',
      })
      return
    }
    for (const session of this.live()) await this.loadUnpacked(session, dir)
    const session = this.primary()
    const added = session?.extensions.getAllExtensions().find((e) => e.path === dir)
    if (added) {
      this.stored[added.id] = {
        name: added.name,
        version: added.version,
        unpackedPath: dir,
      }
      this.persist()
    }
    this.emit()
  }

  openStore(): void {
    void shell.openExternal(STORE_URL)
  }

  storeUrl(): string {
    return STORE_URL
  }

  async checkForUpdates(): Promise<void> {
    const session = this.primary()
    if (session) await updateExtensions(session).catch(() => undefined)
    this.emit()
  }

  emit(): void {
    this.push(this.list())
  }

  // ---- internals ----------------------------------------------------------

  private async loadUnpacked(session: Session, path: string): Promise<void> {
    if (!existsSync(join(path, 'manifest.json'))) return
    await session.extensions.loadExtension(path, { allowFileAccess: true }).catch(() => null)
  }

  private unpackedPaths(): Array<[string, StoredExtension]> {
    return Object.values(this.stored)
      .filter((r) => !!r.unpackedPath && !r.disabled)
      .map((r) => [r.unpackedPath as string, r] as [string, StoredExtension])
  }

  private applyDisabled(session: Session): void {
    for (const [id, record] of Object.entries(this.stored)) {
      if (record.disabled && session.extensions.getExtension(id)) {
        session.extensions.removeExtension(id)
      }
    }
  }

  /** Note what is loaded, so disabled extensions still have a name to show. */
  private remember(session: Session): void {
    for (const extension of session.extensions.getAllExtensions()) {
      const existing = this.stored[extension.id]
      this.stored[extension.id] = {
        ...existing,
        name: extension.name,
        version: extension.version,
      }
    }
    this.persist()
    this.emit()
  }

  private storePathFor(session: Session, id: string): string | null {
    const loaded = session.extensions.getExtension(id)
    return loaded?.path ?? null
  }

  private iconFor(path: string, manifest: { icons?: Record<string, string> }): string | null {
    const icons = manifest.icons ?? {}
    const best = Object.keys(icons)
      .map(Number)
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => b - a)[0]
    const relative = best ? icons[String(best)] : undefined
    if (!relative) return null
    try {
      const file = join(path, relative)
      if (!existsSync(file)) return null
      const ext = relative.split('.').pop()?.toLowerCase()
      const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : 'image/png'
      return `data:${mime};base64,${readFileSync(file).toString('base64')}`
    } catch {
      return null
    }
  }

  private live(): Session[] {
    return [...this.sessions]
  }

  private primary(): Session | null {
    return this.live()[0] ?? null
  }

  private persist(): void {
    this.kv.set(KV_KEY, this.stored)
  }
}
