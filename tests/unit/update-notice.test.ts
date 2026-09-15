import { describe, expect, it } from 'vitest'
import { describeUpdate } from '@/lib/update-notice'
import type { UpdateState } from '@shared/models'

const base: UpdateState = {
  status: 'idle',
  currentVersion: '0.1.1',
  availableVersion: null,
  percent: null,
  message: null,
  releasesUrl: 'https://example.test/releases',
  checkedAt: null,
}

describe('describeUpdate', () => {
  it('stays quiet for idle, checking, up-to-date, and errors', () => {
    for (const status of ['idle', 'checking', 'up-to-date', 'error', 'unsupported'] as const) {
      expect(describeUpdate({ ...base, status, availableVersion: '0.1.2' }, null)).toBeNull()
    }
    expect(describeUpdate(null, null)).toBeNull()
  })

  it('surfaces preparing, downloading with a clamped percent, and ready', () => {
    expect(
      describeUpdate({ ...base, status: 'available', availableVersion: '0.1.2' }, null),
    ).toEqual({ kind: 'preparing', version: '0.1.2' })
    expect(
      describeUpdate(
        { ...base, status: 'downloading', availableVersion: '0.1.2', percent: 12 },
        null,
      ),
    ).toEqual({ kind: 'downloading', version: '0.1.2', percent: 12 })
    expect(
      describeUpdate(
        { ...base, status: 'downloading', availableVersion: '0.1.2', percent: 140 },
        null,
      )?.kind === 'downloading' &&
        describeUpdate(
          { ...base, status: 'downloading', availableVersion: '0.1.2', percent: 140 },
          null,
        ),
    ).toMatchObject({ percent: 100 })
    expect(describeUpdate({ ...base, status: 'ready', availableVersion: '0.1.2' }, null)).toEqual({
      kind: 'ready',
      version: '0.1.2',
    })
  })

  it('honours "Later" for that version only', () => {
    const ready = { ...base, status: 'ready' as const, availableVersion: '0.1.2' }
    expect(describeUpdate(ready, '0.1.2')).toBeNull()
    expect(describeUpdate(ready, '0.1.1')).not.toBeNull()
  })
})
