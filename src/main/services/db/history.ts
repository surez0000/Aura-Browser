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
   * A page of history for the history manager, newest first. `before` is the
   * `visitedAt` of the last row already shown, which keeps paging stable while
   * new visits are being recorded (an OFFSET would shift under them).
   */
  list(opts: { query?: string; before?: number; limit?: number } = {}): HistoryEntry[] {
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500)
    const before = opts.before ?? Number.MAX_SAFE_INTEGER
    const q = opts.query?.trim()
    if (q) {
      const like = `%${q}%`
      return this.listSearchStmt.all(before, like, like, limit) as HistoryEntry[]
    }
    return this.listStmt.all(before, limit) as HistoryEntry[]
  }

  /** Remove individual visits. */
  deleteEntries(ids: readonly number[]): number {
    if (ids.length === 0) return 0
    let removed = 0
    this.db.transaction(() => {
      for (const id of ids) removed += this.deleteByIdStmt.run(id).changes
    })()
    return removed
  }

  /** Remove every visit to a URL ("forget this site"). */
  deleteUrl(url: string): number {
    return this.deleteByUrlStmt.run(url).changes
  }

  /**
   * Clear visits newer than `since` (epoch ms); `null` clears everything.
   * Returns how many rows went.
   */
  clear(since: number | null): number {
    return since === null ? this.clearAllStmt.run().changes : this.clearSinceStmt.run(since).changes
  }

  count(): number {
    return (this.countStmt.get() as { n: number }).n
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

  private get listStmt() {
    return (this.listCached ??= this.db.prepare(
      `SELECT id, url, title, visited_at AS visitedAt FROM history
       WHERE visited_at < ? ORDER BY visited_at DESC LIMIT ?`,
    ))
  }
  private listCached: ReturnType<AuroraDb['prepare']> | undefined

  private get listSearchStmt() {
    return (this.listSearchCached ??= this.db.prepare(
      `SELECT id, url, title, visited_at AS visitedAt FROM history
       WHERE visited_at < ? AND (url LIKE ? OR title LIKE ?)
       ORDER BY visited_at DESC LIMIT ?`,
    ))
  }
  private listSearchCached: ReturnType<AuroraDb['prepare']> | undefined

  private get deleteByIdStmt() {
    return (this.deleteByIdCached ??= this.db.prepare('DELETE FROM history WHERE id = ?'))
  }
  private deleteByIdCached: ReturnType<AuroraDb['prepare']> | undefined

  private get deleteByUrlStmt() {
    return (this.deleteByUrlCached ??= this.db.prepare('DELETE FROM history WHERE url = ?'))
  }
  private deleteByUrlCached: ReturnType<AuroraDb['prepare']> | undefined

  private get clearSinceStmt() {
    return (this.clearSinceCached ??= this.db.prepare('DELETE FROM history WHERE visited_at >= ?'))
  }
  private clearSinceCached: ReturnType<AuroraDb['prepare']> | undefined

  private get clearAllStmt() {
    return (this.clearAllCached ??= this.db.prepare('DELETE FROM history'))
  }
  private clearAllCached: ReturnType<AuroraDb['prepare']> | undefined

  private get countStmt() {
    return (this.countCached ??= this.db.prepare('SELECT COUNT(*) AS n FROM history'))
  }
  private countCached: ReturnType<AuroraDb['prepare']> | undefined
}
