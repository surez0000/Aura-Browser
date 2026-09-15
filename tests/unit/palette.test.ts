import { describe, expect, it } from 'vitest'
import { buildActions, composePalette, type PaletteContext } from '@/lib/palette'
import type { SpaceInfo, TabInfo } from '@shared/models'

function space(id: string, overrides: Partial<SpaceInfo> = {}): SpaceInfo {
  return { id, name: id, accentHue: 226, incognito: false, favorites: [], ...overrides }
}

function tab(id: string, title: string, url: string, spaceId = 's1'): TabInfo {
  return {
    id,
    spaceId,
    kind: 'today',
    url,
    pendingUrl: null,
    title,
    faviconUrl: null,
    isLoading: false,
    domReady: false,
    canGoBack: false,
    canGoForward: false,
    crashed: false,
    security: 'secure',
    zoomPercent: 100,
  }
}

function ctx(overrides: Partial<PaletteContext>): PaletteContext {
  return {
    query: '',
    mode: 'new',
    tabs: [],
    spaces: [space('s1')],
    activeSpaceId: 's1',
    history: [],
    archived: [],
    actions: [],
    ...overrides,
  }
}

describe('composePalette', () => {
  it('ranks an explicit URL above everything', () => {
    const items = composePalette(
      ctx({
        query: 'https://example.com/x',
        tabs: [tab('t1', 'Example Domain', 'https://example.com/')],
        history: [{ url: 'https://example.com/x', title: 'X', visitedAt: 1, visits: 9 }],
      }),
    )
    expect(items[0]?.type).toBe('url')
    expect(items[0]?.payload.url).toBe('https://example.com/x')
  })

  it('ranks an open tab above a history row for the same words', () => {
    const items = composePalette(
      ctx({
        query: 'release notes',
        tabs: [tab('t1', 'Release Notes', 'https://a.dev/notes')],
        history: [{ url: 'https://b.dev/rel', title: 'Release Notes', visitedAt: 1, visits: 3 }],
      }),
    )
    expect(items[0]?.type).toBe('tab')
    expect(items[0]?.payload.tabId).toBe('t1')
  })

  it('always appends a web-search fallback for non-empty queries', () => {
    const items = composePalette(ctx({ query: 'weather tomorrow' }))
    const search = items.find((i) => i.type === 'search')
    expect(search).toBeTruthy()
    expect(search?.payload.url).toContain('duckduckgo.com')
  })

  it('surfaces matching actions', () => {
    const actions = buildActions({ spaces: [space('s1')], activeSpaceId: 's1', activeTab: null })
    const items = composePalette(ctx({ query: 'incognito', actions }))
    expect(items.some((i) => i.type === 'action' && i.payload.actionId === 'incognito')).toBe(true)
  })

  it('offers switch/move actions for other spaces', () => {
    const spaces = [space('s1'), space('s2', { name: 'Work' })]
    const actions = buildActions({
      spaces,
      activeSpaceId: 's1',
      activeTab: tab('t1', 'Doc', 'https://a.dev'),
    })
    expect(actions.some((a) => a.id === 'space:switch:s2')).toBe(true)
    expect(actions.some((a) => a.id === 'tab:move:s2')).toBe(true)
    // Never offers moving into an incognito space from a normal one.
    const withIncognito = buildActions({
      spaces: [space('s1'), space('s3', { incognito: true })],
      activeSpaceId: 's1',
      activeTab: tab('t1', 'Doc', 'https://a.dev'),
    })
    expect(withIncognito.some((a) => a.id === 'tab:move:s3')).toBe(false)
  })

  it('empty query lists active-space tabs, then recent history', () => {
    const items = composePalette(
      ctx({
        tabs: [tab('t1', 'A', 'https://a.dev'), tab('t2', 'B', 'https://b.dev', 's2')],
        history: [{ url: 'https://c.dev', title: 'C', visitedAt: 1, visits: 1 }],
      }),
    )
    expect(items[0]?.type).toBe('tab')
    expect(items[0]?.payload.tabId).toBe('t1')
    expect(items.some((i) => i.type === 'tab' && i.payload.tabId === 't2')).toBe(false)
    expect(items.some((i) => i.type === 'history')).toBe(true)
  })

  it('dedupes same-URL rows, keeping the higher-scored source', () => {
    const favSpace = space('s1', {
      favorites: [{ url: 'https://dup.dev', title: 'Dup Site', faviconUrl: null }],
    })
    const items = composePalette(
      ctx({
        query: 'dup site',
        spaces: [favSpace],
        history: [{ url: 'https://dup.dev', title: 'Dup Site', visitedAt: 1, visits: 2 }],
      }),
    )
    const dupRows = items.filter((i) => i.payload.url === 'https://dup.dev')
    expect(dupRows).toHaveLength(1)
    expect(dupRows[0]?.type).toBe('favorite')
  })
})
