import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Whether Aura's last run ended without quitting — a crash, a force quit, the
 * power going. A marker is written as Aura starts and removed when it quits
 * cleanly, so finding one at startup means the last run never got that far.
 *
 * Session restore uses this to keep the pages that would open by themselves
 * closed: a page that takes the whole browser down would otherwise do it again
 * on every launch, and the updater — the one thing that could fix it — would
 * never get the chance to run.
 */
export class LaunchGuard {
  readonly lastRunEndedUncleanly: boolean
  private readonly marker: string

  constructor(userDataDir: string) {
    this.marker = join(userDataDir, '.running')
    this.lastRunEndedUncleanly = existsSync(this.marker)
    try {
      writeFileSync(this.marker, String(Date.now()))
    } catch {
      // An unwritable profile loses the guard, never the launch.
    }
  }

  /** This run is ending normally. */
  clear(): void {
    try {
      rmSync(this.marker, { force: true })
    } catch {
      // The next launch just restores carefully.
    }
  }
}
