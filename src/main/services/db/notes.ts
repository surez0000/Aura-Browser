import type { AuroraDb } from './index'
import type { NoteEntry } from '@shared/models'

/** SQLite has no boolean; `pinned` comes back as 0 or 1. */
type RawNote = Omit<NoteEntry, 'pinned'> & { pinned: number }

function hydrate(row: RawNote): NoteEntry {
  return { ...row, pinned: row.pinned === 1 }
}

/** First line, trimmed — what the list and the palette show. */
export function noteTitle(body: string): string {
  const first = body.split('\n', 1)[0]?.trim() ?? ''
  return first.slice(0, 200)
}

export class NotesStore {
  private readonly insertStmt
  private readonly updateStmt
  private readonly deleteStmt
  private readonly colorStmt
  private readonly pinnedStmt
  private readonly deleteEmptyStmt
  private readonly getStmt
  private readonly listStmt
  private readonly searchStmt

  constructor(db: AuroraDb) {
    this.insertStmt = db.prepare(
      `INSERT INTO notes (title, body, url, page_title, color, created_at, updated_at)
       VALUES (@title, @body, @url, @pageTitle, @color, @now, @now)`,
    )
    this.updateStmt = db.prepare(
      'UPDATE notes SET title = ?, body = ?, updated_at = ? WHERE id = ?',
    )
    this.deleteStmt = db.prepare('DELETE FROM notes WHERE id = ?')
    this.colorStmt = db.prepare('UPDATE notes SET color = ? WHERE id = ?')
    this.pinnedStmt = db.prepare('UPDATE notes SET pinned = ? WHERE id = ?')
    this.deleteEmptyStmt = db.prepare("DELETE FROM notes WHERE trim(body) = ''")
    const columns = `id, title, body, url, page_title AS pageTitle, color,
                     pinned, created_at AS createdAt, updated_at AS updatedAt`
    this.getStmt = db.prepare(`SELECT ${columns} FROM notes WHERE id = ?`)
    this.listStmt = db.prepare(
      `SELECT ${columns} FROM notes ORDER BY pinned DESC, updated_at DESC, id DESC LIMIT ?`,
    )
    this.searchStmt = db.prepare(
      `SELECT ${columns} FROM notes
       WHERE title LIKE ? OR body LIKE ? OR page_title LIKE ?
       ORDER BY pinned DESC, updated_at DESC, id DESC LIMIT ?`,
    )
  }

  create(input: {
    body: string
    url?: string | null
    pageTitle?: string | null
    color?: string
  }): NoteEntry {
    const now = Date.now()
    const info = this.insertStmt.run({
      title: noteTitle(input.body),
      body: input.body,
      url: input.url ?? null,
      pageTitle: input.pageTitle ?? null,
      color: input.color ?? 'default',
      now,
    })
    return this.get(Number(info.lastInsertRowid))!
  }

  setColor(id: number, color: string): NoteEntry | null {
    this.colorStmt.run(color, id)
    return this.get(id)
  }

  setPinned(id: number, pinned: boolean): NoteEntry | null {
    this.pinnedStmt.run(pinned ? 1 : 0, id)
    return this.get(id)
  }

  /** An empty note carries nothing; earlier builds could leave one behind. */
  deleteEmpty(): number {
    return this.deleteEmptyStmt.run().changes
  }

  update(id: number, body: string): NoteEntry | null {
    this.updateStmt.run(noteTitle(body), body, Date.now(), id)
    return this.get(id)
  }

  remove(id: number): void {
    this.deleteStmt.run(id)
  }

  get(id: number): NoteEntry | null {
    const row = this.getStmt.get(id) as RawNote | undefined
    return row ? hydrate(row) : null
  }

  list(limit = 200): NoteEntry[] {
    return (this.listStmt.all(limit) as RawNote[]).map(hydrate)
  }

  /** Empty query lists the most recent, which is what an empty search box means. */
  search(query: string, limit = 50): NoteEntry[] {
    const q = query.trim()
    if (!q) return this.list(limit)
    const like = `%${q}%`
    return (this.searchStmt.all(like, like, like, limit) as RawNote[]).map(hydrate)
  }
}
