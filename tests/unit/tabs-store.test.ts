import { beforeEach, describe, expect, it } from 'vitest'
import { reorderGroup, selectActiveSpace, selectActiveTab, tabsOf, useTabs } from '@/state/tabs'
import type { SpaceInfo, TabInfo, TabKind } from '@shared/models'

function space(id: string, overrides: Partial<SpaceInfo> = {}): SpaceInfo {
  return { id, name: id, accentHue: 226, incognito: false, favorites: [], ...overrides }
}

function tab(id: string, spaceId = 's1', kind: TabKind = 'today'): TabInfo {
  return {
    id,
    spaceId,
    kind,
    url: `https://example.com/${id}`,
    pendingUrl: null,
    title: `Tab ${id}`,
    faviconUrl: null,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    crashed: false,
    security: 'secure',
    zoomPercent: 100,
  }
}

beforeEach(() => {
  useTabs.setState({ spaces: [], activeSpaceId: '', tabs: [], activeTabId: null })
})

describe('tabs store', () => {
  it('applies snapshots from main', () => {
    useTabs.getState().applySnapshot({
      spaces: [space('s1'), space('s2', { incognito: true })],
      activeSpaceId: 's2',
      tabs: [tab('a'), tab('b', 's2')],
      activeTabId: 'b',
    })
    const s = useTabs.getState()
    expect(s.spaces).toHaveLength(2)
    expect(selectActiveSpace(s)?.incognito).toBe(true)
    expect(selectActiveTab(s)?.title).toBe('Tab b')
  })

  it('selectActiveTab returns null when the active id is gone', () => {
    useTabs.getState().applySnapshot({
      spaces: [space('s1')],
      activeSpaceId: 's1',
      tabs: [tab('a')],
      activeTabId: 'missing',
    })
    expect(selectActiveTab(useTabs.getState())).toBeNull()
  })

  it('tabsOf filters by space and kind in order', () => {
    const tabs = [tab('p1', 's1', 'pinned'), tab('t1'), tab('x', 's2'), tab('t2')]
    expect(tabsOf(tabs, 's1', 'today').map((t) => t.id)).toEqual(['t1', 't2'])
    expect(tabsOf(tabs, 's1', 'pinned').map((t) => t.id)).toEqual(['p1'])
  })
})

describe('reorderGroup', () => {
  it('reorders only the inferred (space, kind) group', () => {
    const tabs = [tab('p1', 's1', 'pinned'), tab('a'), tab('other', 's2'), tab('b'), tab('c')]
    const next = reorderGroup(tabs, ['c', 'a', 'b'])
    expect(next.map((t) => t.id)).toEqual(['p1', 'c', 'other', 'a', 'b'])
  })

  it('ignores ids from outside the group and unknown ids', () => {
    const tabs = [tab('a'), tab('b'), tab('p1', 's1', 'pinned')]
    const next = reorderGroup(tabs, ['b', 'p1', 'nope', 'a'])
    expect(next.map((t) => t.id)).toEqual(['b', 'a', 'p1'])
  })

  it('returns the same order for an empty id list', () => {
    const tabs = [tab('a'), tab('b')]
    expect(reorderGroup(tabs, []).map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('applyGroupOrder updates the store optimistically', () => {
    useTabs.getState().applySnapshot({
      spaces: [space('s1')],
      activeSpaceId: 's1',
      tabs: [tab('a'), tab('b')],
      activeTabId: 'a',
    })
    useTabs.getState().applyGroupOrder(['b', 'a'])
    expect(useTabs.getState().tabs.map((t) => t.id)).toEqual(['b', 'a'])
    expect(useTabs.getState().activeTabId).toBe('a')
  })
})
