import { describe, expect, it } from 'vitest'
import { mergeLegacyFavorites, upgradeSession } from '../../src/main/services/session-store'
import type { SessionSnapshotV2 } from '@shared/models'

describe('upgradeSession', () => {
  it('returns null for garbage', () => {
    expect(upgradeSession(null)).toBeNull()
    expect(upgradeSession('x')).toBeNull()
    expect(upgradeSession({ hello: 1 })).toBeNull()
    expect(upgradeSession({ tabs: [], activeIndex: 0 })).toBeNull()
  })

  it('wraps a v1 snapshot into a default space with today tabs', () => {
    const upgraded = upgradeSession({
      tabs: [
        { url: 'https://a.dev', title: 'A', faviconUrl: null },
        { url: 'https://b.dev', title: 'B', faviconUrl: 'https://b.dev/f.ico' },
      ],
      activeIndex: 1,
    })
    expect(upgraded).not.toBeNull()
    expect(upgraded?.version).toBe(2)
    expect(upgraded?.spaces).toHaveLength(1)
    const s = upgraded!.spaces[0]!
    expect(s.name).toBe('Personal')
    expect(s.tabs.map((t) => t.kind)).toEqual(['today', 'today'])
    expect(s.activeIndex).toBe(1)
    expect(upgraded!.activeSpaceId).toBe(s.id)
  })

  it('clamps a v1 activeIndex that is out of range', () => {
    const upgraded = upgradeSession({
      tabs: [{ url: 'https://a.dev', title: 'A', faviconUrl: null }],
      activeIndex: 7,
    })
    expect(upgraded?.spaces[0]?.activeIndex).toBe(0)
  })

  it('passes v2 through, sanitizing bad kinds and hues', () => {
    const upgraded = upgradeSession({
      version: 2,
      activeSpaceId: 'w',
      spaces: [
        {
          id: 'w',
          name: 'Work',
          accentHue: 725,
          favorites: [{ url: 'https://f.dev', title: 'F', faviconUrl: null }],
          activeIndex: 0,
          tabs: [{ url: 'https://a.dev', title: 'A', faviconUrl: null, kind: 'weird' }],
        },
      ],
    })
    expect(upgraded?.spaces[0]?.accentHue).toBe(5)
    expect(upgraded?.spaces[0]?.tabs[0]?.kind).toBe('today')
    expect(upgraded?.activeSpaceId).toBe('w')
  })

  it('falls back to the first space when activeSpaceId is unknown', () => {
    const upgraded = upgradeSession({
      version: 2,
      activeSpaceId: 'gone',
      spaces: [
        {
          id: 'w',
          name: 'W',
          accentHue: 1,
          favorites: [],
          activeIndex: 0,
          tabs: [{ url: 'https://a.dev', title: '', faviconUrl: null, kind: 'today' }],
        },
      ],
    })
    expect(upgraded?.activeSpaceId).toBe('w')
  })
})

describe('mergeLegacyFavorites', () => {
  const base = (): SessionSnapshotV2 => ({
    version: 2,
    activeSpaceId: 's1',
    spaces: [
      {
        id: 's1',
        name: 'Personal',
        accentHue: 226,
        favorites: [{ url: 'https://kept.dev', title: 'Kept', faviconUrl: null }],
        activeIndex: 0,
        tabs: [],
      },
    ],
  })

  it('appends legacy favorites, deduped by url', () => {
    const merged = mergeLegacyFavorites(base(), [
      { url: 'https://kept.dev', title: 'Dup', faviconUrl: null },
      { url: 'https://new.dev', title: 'New', faviconUrl: null },
    ])
    const favorites = merged.spaces[0]!.favorites
    expect(favorites.map((f) => f.url)).toEqual(['https://kept.dev', 'https://new.dev'])
  })

  it('ignores non-array input', () => {
    const merged = mergeLegacyFavorites(base(), { not: 'an array' })
    expect(merged.spaces[0]!.favorites).toHaveLength(1)
  })
})
