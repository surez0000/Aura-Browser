import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDb, type AuroraDb } from '../../src/main/services/db/index'
import { RemindersStore } from '../../src/main/services/db/reminders'
import { TimesheetStore } from '../../src/main/services/db/timesheet'

let dir: string
let db: AuroraDb

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aura-apps-db-'))
  db = openDb(join(dir, 'test.db'))
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

const wed = (h: number, m = 0): number => new Date(2026, 8, 23, h, m).getTime()

describe('reminders store', () => {
  it('creates, lists soonest first, and keeps done ones at the bottom', () => {
    const r = new RemindersStore(db)
    const later = r.create({ text: 'later', dueAt: wed(15) })
    const soon = r.create({ text: 'soon', dueAt: wed(10) })
    r.complete(later.id, wed(9))
    expect(r.list().map((x) => x.text)).toEqual(['soon', 'later'])
    expect(r.open().map((x) => x.id)).toEqual([soon.id])
  })

  it('carries the page it was set from', () => {
    const r = new RemindersStore(db)
    const x = r.create({ text: 'read this', dueAt: wed(10), url: 'https://a.dev', pageTitle: 'A' })
    expect(x.url).toBe('https://a.dev')
    expect(x.pageTitle).toBe('A')
  })

  it('snoozes, remembers it was raised, and forgets both on edit', () => {
    const r = new RemindersStore(db)
    const x = r.create({ text: 'x', dueAt: wed(10) })
    r.markNotified(x.id, wed(10))
    r.snooze(x.id, wed(10, 10))
    expect(r.get(x.id)).toMatchObject({ notifiedAt: wed(10), snoozedUntil: wed(10, 10) })
    r.update(x.id, { text: 'y', dueAt: wed(11), repeat: 'none' })
    expect(r.get(x.id)).toMatchObject({ text: 'y', notifiedAt: null, snoozedUntil: null })
  })

  it('completing a one-off finishes it', () => {
    const r = new RemindersStore(db)
    const x = r.create({ text: 'x', dueAt: wed(10) })
    expect(r.complete(x.id, wed(10, 1))?.doneAt).toBe(wed(10, 1))
  })

  it('completing a repeat moves it to the next occurrence instead', () => {
    const r = new RemindersStore(db)
    const x = r.create({ text: 'standup', dueAt: wed(10), repeat: 'daily' })
    r.markNotified(x.id, wed(10))
    const next = r.complete(x.id, wed(10, 1))
    expect(next?.doneAt).toBeNull()
    expect(next?.dueAt).toBe(new Date(2026, 8, 24, 10).getTime())
    expect(next?.notifiedAt).toBeNull()
  })

  it('a repeat completed days late lands in the future, not the past', () => {
    const r = new RemindersStore(db)
    const x = r.create({ text: 'water plants', dueAt: wed(10), repeat: 'daily' })
    const next = r.complete(x.id, wed(10) + 3 * 86_400_000 + 1)
    expect(next?.dueAt).toBe(new Date(2026, 8, 27, 10).getTime())
  })

  it('clears the done pile', () => {
    const r = new RemindersStore(db)
    const a = r.create({ text: 'a', dueAt: wed(10) })
    r.create({ text: 'b', dueAt: wed(11) })
    r.complete(a.id)
    expect(r.clearDone()).toBe(1)
    expect(r.list()).toHaveLength(1)
  })
})

describe('timesheet store', () => {
  it('asks, keeps the question pending until answered, and knows the last answer', () => {
    const t = new TimesheetStore(db)
    expect(t.pending()).toBeNull()
    expect(t.lastAskedAt()).toBeNull()
    const q = t.ask(wed(9), { title: 'Spec', url: 'https://a.dev/spec' })
    expect(t.pending()?.id).toBe(q.id)
    expect(t.lastAskedAt()).toBe(wed(9))
    expect(t.lastAnswer()).toBeNull()

    t.answer(q.id, '  Reviewing the spec ', wed(9, 1))
    expect(t.pending()).toBeNull()
    expect(t.lastAnswer()).toBe('Reviewing the spec')
    expect(t.get(q.id)).toMatchObject({ tabTitle: 'Spec', tabUrl: 'https://a.dev/spec' })
  })

  it('a skipped question is no longer pending and is not an answer', () => {
    const t = new TimesheetStore(db)
    const q = t.ask(wed(9), { title: null, url: null })
    t.skip(q.id, wed(9, 2))
    expect(t.pending()).toBeNull()
    expect(t.get(q.id)?.skipped).toBe(true)
    expect(t.lastAnswer()).toBeNull()
  })

  it('returns a day in order', () => {
    const t = new TimesheetStore(db)
    t.ask(wed(10), { title: null, url: null })
    t.ask(wed(9), { title: null, url: null })
    t.ask(wed(9) + 86_400_000, { title: null, url: null })
    const day = t.between(wed(0), wed(0) + 86_400_000)
    expect(day.map((e) => e.askedAt)).toEqual([wed(9), wed(10)])
  })
})
