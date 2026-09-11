import type { AuroraDb } from './index'
import type { HistoryEntry, HistorySearchRow } from '@shared/models'

function isRecordable(url: string): boolean {
  return url.startsWith('https://') || url.startsWith('http://')
}

export class HistoryStore {
  private readonly insertStmt
  private readonly lastForUrlStmt
  private readonly setTitleStmt
  private readonly recentStmt

  constructor(private readonly db: AuroraDb) {
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

  /**
   * Palette search: scan recent matching visits, aggregate by URL in JS
   * (visit count + latest title/timestamp), most-visited-then-recent first.
   */
  search(query: string, limit = 8): HistorySearchRow[] {
    const q = query.trim()
    const rows = (
      q ? this.searchScanStmt.all(`%${q}%`, `%${q}%`) : this.recentStmt.all(80)
    ) as HistoryEntry[]
    const byUrl = new Map<string, HistorySearchRow>()
    for (const row of rows) {
      const existing = byUrl.get(row.url)
      if (existing) {
        existing.visits++
        if (row.visitedAt > existing.visitedAt) {
          existing.visitedAt = row.visitedAt
          if (row.title) existing.title = row.title
        }
      } else {
        byUrl.set(row.url, {
          url: row.url,
          title: row.title,
          visitedAt: row.visitedAt,
          visits: 1,
        })
      }
    }
    return [...byUrl.values()]
      .sort((a, b) => b.visits - a.visits || b.visitedAt - a.visitedAt)
      .slice(0, limit)
  }

  private get searchScanStmt() {
    return (this.searchScanCached ??= this.db.prepare(
      `SELECT id, url, title, visited_at AS visitedAt FROM history
       WHERE url LIKE ? OR title LIKE ?
       ORDER BY visited_at DESC LIMIT 400`,
    ))
  }
  private searchScanCached: ReturnType<AuroraDb['prepare']> | undefined
}
