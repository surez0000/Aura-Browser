import { describe, expect, it } from 'vitest'
import { buildActions, composePalette, type PaletteContext } from '@/lib/palette'
import type { SpaceInfo, TabInfo } from '@shared/models'

function space(id: string, overrides: Partial<SpaceInfo> = {}): SpaceInfo {
  return {
    id,
    name: id,
    accentHue: 226,
    accentHue2: null,
    incognito: false,
    favorites: [],
    ...overrides,
  }
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

  it('offers a machine on this network as a destination, not a search', () => {
    // The reported case: a bare host with a trailing slash went to the search
    // engine, so the palette never offered the machine at all.
    for (const query of ['localmachine/', 'nas/photos', 'myserver:8080', '192.168.1.5']) {
      const items = composePalette(ctx({ query }))
      const top = items[0]
      expect(top?.type, query).toBe('url')
      expect(top?.payload.url, query).toMatch(/^http:\/\//)
    }
  })

  it('finds a note, and says which page it came from', () => {
    const items = composePalette(
      ctx({
        query: 'tiers',
        notes: [
          {
            id: 7,
            title: 'Check the pricing page',
            body: 'they changed the tiers',
            url: 'https://example.com/pricing',
            pageTitle: 'Pricing — Example',
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      }),
    )
    const note = items.find((i) => i.type === 'note')
    expect(note?.payload.noteId).toBe(7)
    expect(note?.title).toBe('Check the pricing page')
    expect(note?.subtitle).toBe('Pricing — Example')
  })

  it('offers app commands only for apps that are switched on', () => {
    const base = { spaces: [space('s1')], activeSpaceId: 's1', activeTab: null }
    // The Store is always reachable — it is how an app gets switched on.
    expect(buildActions(base).some((a) => a.id === 'apps:store')).toBe(true)
    expect(buildActions(base).some((a) => a.id === 'notes:new')).toBe(false)
    const withNotes = buildActions({ ...base, enabledApps: ['notes'] })
    expect(withNotes.some((a) => a.id === 'notes:new')).toBe(true)
    expect(withNotes.some((a) => a.id === 'notes:open')).toBe(true)
  })

  it('always appends a web-search fallback for non-empty queries', () => {
    const items = composePalette(ctx({ query: 'weather tomorrow' }))
    const search = items.find((i) => i.type === 'search')
    expect(search).toBeTruthy()
    expect(search?.payload.url).toContain('duckduckgo.com')
  })

  it('surfaces matching actions in the command palette', () => {
    const actions = buildActions({ spaces: [space('s1')], activeSpaceId: 's1', activeTab: null })
    const items = composePalette(ctx({ query: 'incognito', mode: 'command', actions }))
    expect(items.some((i) => i.type === 'action' && i.payload.actionId === 'incognito')).toBe(true)
    expect(items.every((i) => i.type === 'action')).toBe(true)
  })

  it('lists every action when the command palette opens with no query', () => {
    const actions = buildActions({ spaces: [space('s1')], activeSpaceId: 's1', activeTab: null })
    const items = composePalette(ctx({ query: '', mode: 'command', actions, limit: 100 }))
    expect(items).toHaveLength(actions.length)
  })

  it('keeps actions out of the New Tab and address fields', () => {
    // That field is for reaching a page: commands crowded out the tabs and
    // history it exists to surface, and they have their own palette now.
    const actions = buildActions({ spaces: [space('s1')], activeSpaceId: 's1', activeTab: null })
    for (const mode of ['new', 'edit'] as const) {
      const items = composePalette(ctx({ query: 'incognito', mode, actions }))
      expect(
        items.some((i) => i.type === 'action'),
        mode,
      ).toBe(false)
    }
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
