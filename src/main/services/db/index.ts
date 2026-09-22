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
  // v3 — Aura Apps: Notes. Global, not per Space (a thought had in one Space is
  // still worth finding from another); it keeps the page it was taken on.
  `CREATE TABLE notes (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     title TEXT NOT NULL DEFAULT '',
     body TEXT NOT NULL DEFAULT '',
     url TEXT,
     page_title TEXT,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE INDEX idx_notes_updated ON notes (updated_at DESC);`,
  // v4 — a note is a sticky: it carries a colour, and it can be pinned to the
  // top of the board. Colour is the thing that makes one findable at a glance.
  `ALTER TABLE notes ADD COLUMN color TEXT NOT NULL DEFAULT 'default';
   ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;`,
  // v5 — Reminders and the Timesheet. Both global, like notes. A reminder
  // remembers when it was last raised so a tick never says the same thing
  // twice; a timesheet entry is the question as asked, answered or not.
  `CREATE TABLE reminders (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     text TEXT NOT NULL,
     due_at INTEGER NOT NULL,
     repeat TEXT NOT NULL DEFAULT 'none',
     done_at INTEGER,
     snoozed_until INTEGER,
     notified_at INTEGER,
     url TEXT,
     page_title TEXT,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX idx_reminders_due ON reminders (done_at, due_at);
   CREATE TABLE timesheet_entries (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     asked_at INTEGER NOT NULL,
     answered_at INTEGER,
     answer TEXT,
     tab_title TEXT,
     tab_url TEXT,
     skipped INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX idx_timesheet_asked ON timesheet_entries (asked_at DESC);`,
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
