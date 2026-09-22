import type { AuroraDb } from './index'
import type { TimesheetEntry } from '@shared/schedule'

type Raw = Omit<TimesheetEntry, 'skipped'> & { skipped: number }

function hydrate(row: Raw): TimesheetEntry {
  return { ...row, skipped: row.skipped === 1 }
}

const COLUMNS = `id, asked_at AS askedAt, answered_at AS answeredAt, answer,
                 tab_title AS tabTitle, tab_url AS tabUrl, skipped`

export class TimesheetStore {
  private readonly askStmt
  private readonly getStmt
  private readonly pendingStmt
  private readonly lastAskedStmt
  private readonly answerStmt
  private readonly skipStmt
  private readonly lastAnswerStmt
  private readonly rangeStmt
  private readonly deleteStmt

  constructor(db: AuroraDb) {
    this.askStmt = db.prepare(
      `INSERT INTO timesheet_entries (asked_at, tab_title, tab_url) VALUES (?, ?, ?)`,
    )
    this.getStmt = db.prepare(`SELECT ${COLUMNS} FROM timesheet_entries WHERE id = ?`)
    this.pendingStmt = db.prepare(
      `SELECT ${COLUMNS} FROM timesheet_entries
       WHERE answered_at IS NULL AND skipped = 0 ORDER BY asked_at DESC LIMIT 1`,
    )
    this.lastAskedStmt = db.prepare('SELECT MAX(asked_at) AS at FROM timesheet_entries')
    this.answerStmt = db.prepare(
      'UPDATE timesheet_entries SET answer = ?, answered_at = ?, skipped = 0 WHERE id = ?',
    )
    this.skipStmt = db.prepare(
      'UPDATE timesheet_entries SET skipped = 1, answered_at = ? WHERE id = ?',
    )
    this.lastAnswerStmt = db.prepare(
      `SELECT answer FROM timesheet_entries
       WHERE answer IS NOT NULL AND answer <> '' ORDER BY answered_at DESC LIMIT 1`,
    )
    this.rangeStmt = db.prepare(
      `SELECT ${COLUMNS} FROM timesheet_entries
       WHERE asked_at >= ? AND asked_at < ? ORDER BY asked_at ASC`,
    )
    this.deleteStmt = db.prepare('DELETE FROM timesheet_entries WHERE id = ?')
  }

  /** The question, asked. Unanswered until `answer` or `skip`. */
  ask(at: number, tab: { title: string | null; url: string | null }): TimesheetEntry {
    const info = this.askStmt.run(at, tab.title, tab.url)
    return this.get(Number(info.lastInsertRowid))!
  }

  get(id: number): TimesheetEntry | null {
    const row = this.getStmt.get(id) as Raw | undefined
    return row ? hydrate(row) : null
  }

  /** The question still waiting for an answer, if there is one. */
  pending(): TimesheetEntry | null {
    const row = this.pendingStmt.get() as Raw | undefined
    return row ? hydrate(row) : null
  }

  lastAskedAt(): number | null {
    const row = this.lastAskedStmt.get() as { at: number | null }
    return row.at
  }

  answer(id: number, answer: string, at = Date.now()): TimesheetEntry | null {
    this.answerStmt.run(answer.trim(), at, id)
    return this.get(id)
  }

  skip(id: number, at = Date.now()): TimesheetEntry | null {
    this.skipStmt.run(at, id)
    return this.get(id)
  }

  /** What was said last time — the one-click answer. */
  lastAnswer(): string | null {
    const row = this.lastAnswerStmt.get() as { answer: string } | undefined
    return row?.answer ?? null
  }

  between(from: number, to: number): TimesheetEntry[] {
    return (this.rangeStmt.all(from, to) as Raw[]).map(hydrate)
  }

  remove(id: number): void {
    this.deleteStmt.run(id)
  }
}
