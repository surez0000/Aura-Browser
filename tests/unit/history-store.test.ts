import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDb, type AuroraDb } from '../../src/main/services/db/index'
import { HistoryStore } from '../../src/main/services/db/history'

let dir: string
let db: AuroraDb
let history: HistoryStore

const HOUR = 3_600_000

/** Insert a visit at a chosen time, bypassing recordVisit's "now". */
function visitAt(url: string, title: string, visitedAt: number): void {
  db.prepare('INSERT INTO history (url, title, visited_at) VALUES (?, ?, ?)').run(
    url,
    title,
    visitedAt,
  )
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aura-history-'))
  db = openDb(join(dir, 'test.db'))
  history = new HistoryStore(db)
})
afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('recording', () => {
  it('records http(s) visits only', () => {
    history.recordVisit('https://a.dev', 'A')
    history.recordVisit('http://b.dev', 'B')
    history.recordVisit('about:blank', 'nope')
    history.recordVisit('data:text/html,x', 'nope')
    expect(history.count()).toBe(2)
  })

  it('patches the title of the latest visit to a url', () => {
    history.recordVisit('https://a.dev')
    history.updateTitle('https://a.dev', 'Later Title')
    expect(history.list()[0]?.title).toBe('Later Title')
  })
})

describe('list', () => {
  beforeEach(() => {
    const now = Date.now()
    visitAt('https://a.dev/1', 'Alpha', now - 1 * HOUR)
    visitAt('https://b.dev/2', 'Beta', now - 2 * HOUR)
    visitAt('https://c.dev/3', 'Gamma search', now - 3 * HOUR)
  })

  it('returns newest first', () => {
    expect(history.list().map((e) => e.title)).toEqual(['Alpha', 'Beta', 'Gamma search'])
  })

  it('filters on title or url', () => {
    expect(history.list({ query: 'search' }).map((e) => e.title)).toEqual(['Gamma search'])
    expect(history.list({ query: 'b.dev' }).map((e) => e.title)).toEqual(['Beta'])
  })

  it('pages with `before`, which stays stable while new visits arrive', () => {
    const first = history.list({ limit: 1 })
    expect(first.map((e) => e.title)).toEqual(['Alpha'])

    history.recordVisit('https://new.dev', 'Newest')
    const second = history.list({ limit: 1, before: first[0]!.visitedAt })
    expect(second.map((e) => e.title)).toEqual(['Beta'])
  })

  it('clamps the page size', () => {
    expect(history.list({ limit: 9999 }).length).toBeLessThanOrEqual(500)
  })
})

describe('deleting', () => {
  it('removes single visits by id', () => {
    history.recordVisit('https://a.dev', 'A')
    history.recordVisit('https://b.dev', 'B')
    const target = history.list().find((e) => e.url === 'https://a.dev')!
    expect(history.deleteEntries([target.id])).toBe(1)
    expect(history.list().map((e) => e.url)).toEqual(['https://b.dev'])
  })

  it('forgets every visit to one url', () => {
    history.recordVisit('https://a.dev', 'A')
    history.recordVisit('https://a.dev', 'A again')
    history.recordVisit('https://b.dev', 'B')
    expect(history.deleteUrl('https://a.dev')).toBe(2)
    expect(history.count()).toBe(1)
  })

  it('clears a time range, keeping anything older', () => {
    const now = Date.now()
    visitAt('https://old.dev', 'Old', now - 5 * HOUR)
    visitAt('https://recent.dev', 'Recent', now - 10_000)
    expect(history.clear(now - HOUR)).toBe(1)
    expect(history.list().map((e) => e.url)).toEqual(['https://old.dev'])
  })

  it('clears everything when the range is null', () => {
    history.recordVisit('https://a.dev', 'A')
    history.recordVisit('https://b.dev', 'B')
    expect(history.clear(null)).toBe(2)
    expect(history.count()).toBe(0)
  })
})
