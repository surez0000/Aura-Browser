import { beforeEach, describe, expect, it } from 'vitest'
import { selectActiveTab, useTabs } from '@/state/tabs'
import type { TabInfo } from '@shared/models'

function tab(id: string, overrides: Partial<TabInfo> = {}): TabInfo {
  return {
    id,
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
    ...overrides,
  }
}

beforeEach(() => {
  useTabs.setState({ tabs: [], activeTabId: null, favorites: [] })
})

describe('tabs store', () => {
  it('applies snapshots from main', () => {
    useTabs.getState().applySnapshot({ tabs: [tab('a'), tab('b')], activeTabId: 'b' })
    const s = useTabs.getState()
    expect(s.tabs.map((t) => t.id)).toEqual(['a', 'b'])
    expect(s.activeTabId).toBe('b')
    expect(selectActiveTab(s)?.title).toBe('Tab b')
  })

  it('selectActiveTab returns null when the active id is gone', () => {
    useTabs.getState().applySnapshot({ tabs: [tab('a')], activeTabId: 'missing' })
    expect(selectActiveTab(useTabs.getState())).toBeNull()
  })

  it('setLocalOrder reorders optimistically without touching the active id', () => {
    useTabs.getState().applySnapshot({ tabs: [tab('a'), tab('b'), tab('c')], activeTabId: 'a' })
    const s = useTabs.getState()
    useTabs.getState().setLocalOrder([s.tabs[2]!, s.tabs[0]!, s.tabs[1]!])
    expect(useTabs.getState().tabs.map((t) => t.id)).toEqual(['c', 'a', 'b'])
    expect(useTabs.getState().activeTabId).toBe('a')
  })

  it('stores favorites', () => {
    useTabs.getState().setFavorites([{ url: 'https://x.dev', title: 'X', faviconUrl: null }])
    expect(useTabs.getState().favorites).toHaveLength(1)
  })
})
