import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const MIGRATIONS: readonly string[] = [
  // v1
  `CREATE TABLE kv (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );
   CREATE TABLE history (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     url TEXT NOT NULL,
     title TEXT NOT NULL DEFAULT '',
     visited_at INTEGER NOT NULL
   );
   CREATE INDEX idx_history_visited_at ON history (visited_at DESC);
   CREATE INDEX idx_history_url ON history (url);`,
]

export type AuroraDb = Database.Database

export function openDb(file: string): AuroraDb {
  mkdirSync(dirname(file), { recursive: true })
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

function migrate(db: AuroraDb): void {
  const current = db.pragma('user_version', { simple: true }) as number
  for (let v = current; v < MIGRATIONS.length; v++) {
    const sql = MIGRATIONS[v]
    if (!sql) continue
    db.transaction(() => {
      db.exec(sql)
      db.pragma(`user_version = ${v + 1}`)
    })()
  }
}
