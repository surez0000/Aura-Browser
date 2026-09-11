import type { AuroraDb } from './index'
import type { HistoryEntry } from '@shared/models'

function isRecordable(url: string): boolean {
  return url.startsWith('https://') || url.startsWith('http://')
}

export class HistoryStore {
  private readonly insertStmt
  private readonly lastForUrlStmt
  private readonly setTitleStmt
  private readonly recentStmt

  constructor(db: AuroraDb) {
    this.insertStmt = db.prepare('INSERT INTO history (url, title, visited_at) VALUES (?, ?, ?)')
    this.lastForUrlStmt = db.prepare(
      'SELECT id FROM history WHERE url = ? ORDER BY visited_at DESC LIMIT 1',
    )
    this.setTitleStmt = db.prepare('UPDATE history SET title = ? WHERE id = ?')
    this.recentStmt = db.prepare(
      'SELECT id, url, title, visited_at AS visitedAt FROM history ORDER BY visited_at DESC LIMIT ?',
    )
  }

  recordVisit(url: string, title = ''): void {
    if (!isRecordable(url)) return
    this.insertStmt.run(url, title, Date.now())
  }

  /** Titles usually arrive after the navigation commits; patch the latest visit. */
  updateTitle(url: string, title: string): void {
    if (!isRecordable(url)) return
    const row = this.lastForUrlStmt.get(url) as { id: number } | undefined
    if (row) this.setTitleStmt.run(title, row.id)
  }

  recent(limit = 50): HistoryEntry[] {
    return this.recentStmt.all(limit) as HistoryEntry[]
  }
}
