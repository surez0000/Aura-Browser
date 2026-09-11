import type { AuroraDb } from './index'

export class KvStore {
  private readonly getStmt
  private readonly setStmt

  constructor(db: AuroraDb) {
    this.getStmt = db.prepare('SELECT value FROM kv WHERE key = ?')
    this.setStmt = db.prepare(
      'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
  }

  get<T>(key: string): T | null {
    const row = this.getStmt.get(key) as { value: string } | undefined
    if (!row) return null
    try {
      return JSON.parse(row.value) as T
    } catch {
      return null
    }
  }

  set(key: string, value: unknown): void {
    this.setStmt.run(key, JSON.stringify(value))
  }
}
