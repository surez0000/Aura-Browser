import { describe, expect, it } from 'vitest'
import { overallProgress } from '../../src/renderer/src/lib/downloads'
import type { DownloadInfo } from '../../src/shared/models'

function d(patch: Partial<DownloadInfo>): DownloadInfo {
  return {
    id: 'd',
    url: 'https://example.test/f.bin',
    filename: 'f.bin',
    savePath: '/tmp/f.bin',
    state: 'progressing',
    receivedBytes: 0,
    totalBytes: 0,
    startedAt: 0,
    ...patch,
  }
}

describe('overallProgress', () => {
  it('reports nothing when no download is running', () => {
    expect(overallProgress([])).toBeNull()
    expect(
      overallProgress([d({ state: 'completed', receivedBytes: 10, totalBytes: 10 })]),
    ).toBeNull()
  })

  it('is the fraction of bytes across everything in flight', () => {
    const progress = overallProgress([
      d({ id: 'a', receivedBytes: 50, totalBytes: 100 }),
      d({ id: 'b', receivedBytes: 150, totalBytes: 300 }),
    ])
    expect(progress).toBeCloseTo(0.5)
  })

  it('ignores downloads whose size the server never declared', () => {
    // Counting the unsized one as zero would drag the ring backwards, and
    // counting it as done would show a full ring over an unfinished file.
    const progress = overallProgress([
      d({ id: 'a', receivedBytes: 90, totalBytes: 100 }),
      d({ id: 'b', receivedBytes: 5, totalBytes: 0 }),
    ])
    expect(progress).toBeCloseTo(0.9)
  })

  it('reports zero when nothing running has a known size', () => {
    expect(overallProgress([d({ receivedBytes: 500, totalBytes: 0 })])).toBe(0)
  })

  it('never exceeds one, even if more arrives than was promised', () => {
    expect(overallProgress([d({ receivedBytes: 150, totalBytes: 100 })])).toBe(1)
  })

  it('counts only what is still running', () => {
    const progress = overallProgress([
      d({ id: 'a', state: 'completed', receivedBytes: 100, totalBytes: 100 }),
      d({ id: 'b', receivedBytes: 25, totalBytes: 100 }),
    ])
    expect(progress).toBeCloseTo(0.25)
  })
})
