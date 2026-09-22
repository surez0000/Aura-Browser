import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDb, type AuroraDb } from '../../src/main/services/db/index'
import { NotesStore, noteTitle } from '../../src/main/services/db/notes'

let dir: string
let db: AuroraDb
let notes: NotesStore

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aura-notes-'))
  db = openDb(join(dir, 'test.db'))
  notes = new NotesStore(db)
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('noteTitle', () => {
  it('is the first line, trimmed', () => {
    expect(noteTitle('  Ship the release  \nthen tell the team')).toBe('Ship the release')
    expect(noteTitle('')).toBe('')
  })

  it('stays bounded for a note written as one long paragraph', () => {
    expect(noteTitle('x'.repeat(500))).toHaveLength(200)
  })
})

describe('notes store', () => {
  it('creates a note carrying the page it was taken on', () => {
    const note = notes.create({
      body: 'Check the pricing page\nthey changed the tiers',
      url: 'https://example.com/pricing',
      pageTitle: 'Pricing — Example',
    })
    expect(note.id).toBeGreaterThan(0)
    expect(note.title).toBe('Check the pricing page')
    expect(note.url).toBe('https://example.com/pricing')
    expect(note.pageTitle).toBe('Pricing — Example')
    expect(note.createdAt).toBe(note.updatedAt)
  })

  it('creates a note with no page at all', () => {
    const note = notes.create({ body: 'standalone' })
    expect(note.url).toBeNull()
    expect(note.pageTitle).toBeNull()
  })

  it('updates the body and the derived title together', () => {
    const note = notes.create({ body: 'first' })
    const updated = notes.update(note.id, 'second line\nmore')
    expect(updated?.title).toBe('second line')
    expect(updated?.body).toBe('second line\nmore')
    expect(updated?.createdAt).toBe(note.createdAt)
  })

  it('lists newest first', () => {
    notes.create({ body: 'older' })
    const newer = notes.create({ body: 'newer' })
    // Same millisecond is possible, so make the order unambiguous.
    notes.update(newer.id, 'newer still')
    expect(notes.list().map((n) => n.title)).toEqual(['newer still', 'older'])
  })

  it('searches the body and the page title, not only the first line', () => {
    notes.create({ body: 'Title line\nthe detail is buried down here' })
    notes.create({ body: 'Unrelated', url: 'https://x.dev', pageTitle: 'Quarterly planning' })
    expect(notes.search('buried').map((n) => n.title)).toEqual(['Title line'])
    expect(notes.search('quarterly').map((n) => n.title)).toEqual(['Unrelated'])
    expect(notes.search('nothing here')).toEqual([])
  })

  it('an empty search lists everything, which is what an empty box means', () => {
    notes.create({ body: 'a' })
    notes.create({ body: 'b' })
    expect(notes.search('   ')).toHaveLength(2)
  })

  it('deletes', () => {
    const note = notes.create({ body: 'temporary' })
    notes.remove(note.id)
    expect(notes.get(note.id)).toBeNull()
    expect(notes.list()).toEqual([])
  })
})
