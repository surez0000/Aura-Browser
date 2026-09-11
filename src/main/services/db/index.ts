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
  // v2 — phase (b): archived Today tabs + download history
  `CREATE TABLE archive (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     url TEXT NOT NULL,
     title TEXT NOT NULL DEFAULT '',
     favicon_url TEXT,
     space_name TEXT NOT NULL DEFAULT '',
     archived_at INTEGER NOT NULL
   );
   CREATE INDEX idx_archive_at ON archive (archived_at DESC);
   CREATE TABLE downloads (
     id TEXT PRIMARY KEY,
     url TEXT NOT NULL,
     filename TEXT NOT NULL,
     save_path TEXT NOT NULL,
     state TEXT NOT NULL,
     received_bytes INTEGER NOT NULL DEFAULT 0,
     total_bytes INTEGER NOT NULL DEFAULT 0,
     started_at INTEGER NOT NULL
   );
   CREATE INDEX idx_downloads_started ON downloads (started_at DESC);`,
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
