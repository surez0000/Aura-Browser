import type { AuroraDb } from './index'
import { nextOccurrence, type ReminderEntry, type RepeatRule } from '@shared/schedule'

type Raw = Omit<ReminderEntry, 'repeat'> & { repeat: string }

function hydrate(row: Raw): ReminderEntry {
  return { ...row, repeat: row.repeat as RepeatRule }
}

const COLUMNS = `id, text, due_at AS dueAt, repeat, done_at AS doneAt,
                 snoozed_until AS snoozedUntil, notified_at AS notifiedAt,
                 url, page_title AS pageTitle, created_at AS createdAt`

export class RemindersStore {
  private readonly insertStmt
  private readonly getStmt
  private readonly listStmt
  private readonly openStmt
  private readonly updateStmt
  private readonly doneStmt
  private readonly snoozeStmt
  private readonly notifiedStmt
  private readonly deleteStmt
  private readonly clearDoneStmt

  constructor(db: AuroraDb) {
    this.insertStmt = db.prepare(
      `INSERT INTO reminders (text, due_at, repeat, url, page_title, created_at)
       VALUES (@text, @dueAt, @repeat, @url, @pageTitle, @now)`,
    )
    this.getStmt = db.prepare(`SELECT ${COLUMNS} FROM reminders WHERE id = ?`)
    this.listStmt = db.prepare(
      `SELECT ${COLUMNS} FROM reminders
       ORDER BY done_at IS NOT NULL, COALESCE(snoozed_until, due_at) ASC, id ASC LIMIT ?`,
    )
    this.openStmt = db.prepare(`SELECT ${COLUMNS} FROM reminders WHERE done_at IS NULL`)
    this.updateStmt = db.prepare(
      `UPDATE reminders SET text = ?, due_at = ?, repeat = ?, snoozed_until = NULL, notified_at = NULL
       WHERE id = ?`,
    )
    this.doneStmt = db.prepare('UPDATE reminders SET done_at = ? WHERE id = ?')
    this.snoozeStmt = db.prepare('UPDATE reminders SET snoozed_until = ? WHERE id = ?')
    this.notifiedStmt = db.prepare('UPDATE reminders SET notified_at = ? WHERE id = ?')
    this.deleteStmt = db.prepare('DELETE FROM reminders WHERE id = ?')
    this.clearDoneStmt = db.prepare('DELETE FROM reminders WHERE done_at IS NOT NULL')
  }

  create(input: {
    text: string
    dueAt: number
    repeat?: RepeatRule
    url?: string | null
    pageTitle?: string | null
  }): ReminderEntry {
    const info = this.insertStmt.run({
      text: input.text.trim(),
      dueAt: input.dueAt,
      repeat: input.repeat ?? 'none',
      url: input.url ?? null,
      pageTitle: input.pageTitle ?? null,
      now: Date.now(),
    })
    return this.get(Number(info.lastInsertRowid))!
  }

  get(id: number): ReminderEntry | null {
    const row = this.getStmt.get(id) as Raw | undefined
    return row ? hydrate(row) : null
  }

  list(limit = 500): ReminderEntry[] {
    return (this.listStmt.all(limit) as Raw[]).map(hydrate)
  }

  /** Everything not yet done — what the scheduler watches. */
  open(): ReminderEntry[] {
    return (this.openStmt.all() as Raw[]).map(hydrate)
  }

  update(
    id: number,
    patch: { text: string; dueAt: number; repeat: RepeatRule },
  ): ReminderEntry | null {
    this.updateStmt.run(patch.text.trim(), patch.dueAt, patch.repeat, id)
    return this.get(id)
  }

  /**
   * Done. A repeating reminder is not finished, it is next: the row moves to
   * its following occurrence and forgets it was ever raised.
   */
  complete(id: number, now = Date.now()): ReminderEntry | null {
    const r = this.get(id)
    if (!r) return null
    const next = nextOccurrence(r.dueAt, r.repeat)
    if (next !== null) {
      // Catch a repeat that fell behind while Aura was closed up to the present.
      let due = next
      while (due <= now) due = nextOccurrence(due, r.repeat) ?? due + 1
      this.updateStmt.run(r.text, due, r.repeat, id)
      return this.get(id)
    }
    this.doneStmt.run(now, id)
    return this.get(id)
  }

  snooze(id: number, until: number): ReminderEntry | null {
    this.snoozeStmt.run(until, id)
    return this.get(id)
  }

  markNotified(id: number, at: number): void {
    this.notifiedStmt.run(at, id)
  }

  remove(id: number): void {
    this.deleteStmt.run(id)
  }

  clearDone(): number {
    return this.clearDoneStmt.run().changes
  }
}
