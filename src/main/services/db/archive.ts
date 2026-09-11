import type { AuroraDb } from './index'
import type { ArchivedTabRow } from '@shared/models'

export class ArchiveStore {
  private readonly insertStmt
  private readonly searchStmt
  private readonly recentStmt

  constructor(db: AuroraDb) {
    this.insertStmt = db.prepare(
      'INSERT INTO archive (url, title, favicon_url, space_name, archived_at) VALUES (?, ?, ?, ?, ?)',
    )
    this.searchStmt = db.prepare(
      `SELECT id, url, title, favicon_url AS faviconUrl, space_name AS spaceName, archived_at AS archivedAt
       FROM archive WHERE url LIKE ? OR title LIKE ?
       ORDER BY archived_at DESC LIMIT ?`,
    )
    this.recentStmt = db.prepare(
      `SELECT id, url, title, favicon_url AS faviconUrl, space_name AS spaceName, archived_at AS archivedAt
       FROM archive ORDER BY archived_at DESC LIMIT ?`,
    )
  }

  record(entry: {
    url: string
    title: string
    faviconUrl: string | null
    spaceName: string
  }): void {
    this.insertStmt.run(entry.url, entry.title, entry.faviconUrl, entry.spaceName, Date.now())
  }

  search(query: string, limit = 10): ArchivedTabRow[] {
    const q = query.trim()
    if (!q) return this.recentStmt.all(limit) as ArchivedTabRow[]
    const like = `%${q}%`
    return this.searchStmt.all(like, like, limit) as ArchivedTabRow[]
  }
}
