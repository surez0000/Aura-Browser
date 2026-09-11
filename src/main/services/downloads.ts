import { app, shell, type DownloadItem, type Session } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { DownloadInfo, DownloadState } from '@shared/models'
import type { AuroraDb } from './db/index'

const PUSH_LIMIT = 30

function uniquePath(dir: string, filename: string): string {
  const ext = extname(filename)
  const stem = basename(filename, ext) || 'download'
  let candidate = join(dir, `${stem}${ext}`)
  for (let i = 1; existsSync(candidate); i++) {
    candidate = join(dir, `${stem} (${i})${ext}`)
  }
  return candidate
}

/**
 * Tracks DownloadItems across sessions (default + incognito), persists rows to
 * SQLite, and pushes the live list to the chrome renderer.
 */
export class DownloadsService {
  private readonly live = new Map<string, { info: DownloadInfo; item: DownloadItem }>()
  private history: DownloadInfo[] = []
  private readonly upsertStmt
  private readonly recentStmt

  constructor(
    db: AuroraDb,
    private readonly targetDir: string,
    private readonly push: (downloads: DownloadInfo[]) => void,
  ) {
    this.upsertStmt = db.prepare(
      `INSERT INTO downloads (id, url, filename, save_path, state, received_bytes, total_bytes, started_at)
       VALUES (@id, @url, @filename, @savePath, @state, @receivedBytes, @totalBytes, @startedAt)
       ON CONFLICT(id) DO UPDATE SET
         state = excluded.state,
         received_bytes = excluded.received_bytes,
         total_bytes = excluded.total_bytes`,
    )
    this.recentStmt = db.prepare(
      `SELECT id, url, filename, save_path AS savePath, state, received_bytes AS receivedBytes,
              total_bytes AS totalBytes, started_at AS startedAt
       FROM downloads WHERE state != 'progressing' ORDER BY started_at DESC LIMIT ?`,
    )
    this.history = this.recentStmt.all(PUSH_LIMIT) as DownloadInfo[]
  }

  attach(session: Session): void {
    session.on('will-download', (_event, item) => this.track(item))
  }

  private track(item: DownloadItem): void {
    mkdirSync(this.targetDir, { recursive: true })
    const savePath = uniquePath(this.targetDir, item.getFilename() || 'download')
    item.setSavePath(savePath)

    const info: DownloadInfo = {
      id: randomUUID(),
      url: item.getURL(),
      filename: basename(savePath),
      savePath,
      state: 'progressing',
      receivedBytes: 0,
      totalBytes: item.getTotalBytes(),
      startedAt: Date.now(),
    }
    this.live.set(info.id, { info, item })
    this.persistAndPush(info)

    item.on('updated', (_e, state) => {
      info.receivedBytes = item.getReceivedBytes()
      info.totalBytes = item.getTotalBytes()
      info.state = state === 'interrupted' ? 'interrupted' : 'progressing'
      this.persistAndPush(info)
    })
    item.once('done', (_e, state) => {
      info.receivedBytes = item.getReceivedBytes()
      info.state = (state === 'completed' ? 'completed' : state) as DownloadState
      this.live.delete(info.id)
      this.history = [info, ...this.history.filter((d) => d.id !== info.id)].slice(0, PUSH_LIMIT)
      this.persistAndPush(info)
    })
  }

  private persistAndPush(info: DownloadInfo): void {
    this.upsertStmt.run(info)
    this.push(this.list())
  }

  list(): DownloadInfo[] {
    const progressing = [...this.live.values()].map((d) => d.info)
    return [...progressing, ...this.history].slice(0, PUSH_LIMIT)
  }

  action(id: string, action: 'open' | 'showInFolder' | 'cancel'): void {
    const liveEntry = this.live.get(id)
    const info = liveEntry?.info ?? this.history.find((d) => d.id === id)
    if (!info) return
    switch (action) {
      case 'cancel':
        liveEntry?.item.cancel()
        break
      case 'open':
        if (info.state === 'completed') void shell.openPath(info.savePath)
        break
      case 'showInFolder':
        if (existsSync(info.savePath)) shell.showItemInFolder(info.savePath)
        break
    }
  }

  static defaultDirectory(): string {
    return process.env.AURORA_USER_DATA_DIR
      ? join(app.getPath('userData'), 'downloads')
      : app.getPath('downloads')
  }
}
