import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LaunchGuard } from '../../src/main/services/launch-guard'

describe('LaunchGuard', () => {
  it('knows a clean quit from a run that never finished', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aura-launch-'))
    const first = new LaunchGuard(dir)
    expect(first.lastRunEndedUncleanly).toBe(false)
    first.clear()
    expect(existsSync(join(dir, '.running'))).toBe(false)

    // Quit cleanly: the next launch restores as usual.
    expect(new LaunchGuard(dir).lastRunEndedUncleanly).toBe(false)
    // …that run never cleared its marker, as a crash wouldn't.
    expect(new LaunchGuard(dir).lastRunEndedUncleanly).toBe(true)
  })

  it('never stops a launch when the profile cannot be written', () => {
    const guard = new LaunchGuard(join(tmpdir(), 'aura-missing', String(Date.now()), 'nested'))
    expect(guard.lastRunEndedUncleanly).toBe(false)
    expect(() => guard.clear()).not.toThrow()
  })
})
