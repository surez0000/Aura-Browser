import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDb, type AuroraDb } from '../../src/main/services/db/index'
import { KvStore } from '../../src/main/services/db/kv'
import { AppRegistry } from '../../src/main/apps/registry'
import type { AppInfo } from '@shared/models'
import type { AuraAppId } from '@shared/apps'

let dir: string
let db: AuroraDb
let kv: KvStore
let pushed: AppInfo[][]
let apps: AppRegistry

function find(id: string): AppInfo {
  return apps.list().find((a) => a.id === id)!
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aura-apps-'))
  db = openDb(join(dir, 'test.db'))
  kv = new KvStore(db)
  pushed = []
  apps = new AppRegistry(kv, (list) => pushed.push(list))
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('app registry', () => {
  it('lists the catalogue with everything off to begin with', () => {
    const list = apps.list()
    expect(list.map((a) => a.id)).toEqual(['notes', 'reminders', 'timesheet'])
    expect(list.every((a) => !a.enabled)).toBe(true)
  })

  it('switches an app on and pushes the new list', () => {
    apps.setEnabled('notes', true)
    expect(find('notes').enabled).toBe(true)
    expect(apps.isEnabled('notes')).toBe(true)
    expect(pushed).toHaveLength(1)
    expect(pushed[0]?.find((a) => a.id === 'notes')?.enabled).toBe(true)
  })

  it('pins by default, so switching an app on puts it where you can reach it', () => {
    apps.setEnabled('notes', true)
    expect(find('notes').pinned).toBe(true)
    apps.setPinned('notes', false)
    expect(find('notes').pinned).toBe(false)
    // Unpinning does not switch it off.
    expect(find('notes').enabled).toBe(true)
  })

  it('ignores an app it does not know, and says nothing', () => {
    // Every catalogue entry is real now; the guard still has to hold for an
    // id that is not in the catalogue at all.
    apps.setEnabled('nope' as AuraAppId, true)
    expect(apps.list().every((a) => !a.enabled)).toBe(true)
    expect(pushed).toHaveLength(0)
  })

  it('remembers the switches across a restart', () => {
    apps.setEnabled('notes', true)
    apps.setPinned('notes', false)
    const reopened = new AppRegistry(kv, () => undefined)
    const notes = reopened.list().find((a) => a.id === 'notes')
    expect(notes?.enabled).toBe(true)
    expect(notes?.pinned).toBe(false)
  })
})
