import { create } from 'zustand'
import type { SpaceInfo, TabInfo, TabKind, TabsSnapshot } from '@shared/models'

export interface TabsState {
  spaces: SpaceInfo[]
  activeSpaceId: string
  tabs: TabInfo[]
  activeTabId: string | null
  /** Tabs on screen in the active space, left to right. */
  panes: string[]
  paneRatios: number[]
  applySnapshot(snapshot: TabsSnapshot): void
  /** Optimistic order for one (space, kind) group while a drag is in flight. */
  applyGroupOrder(orderedIds: string[]): void
}

/**
 * Reorder one (space, kind) group — inferred from the ids — inside the global
 * tab list, leaving every other tab in place. Mirrors TabManager.reorder.
 */
export function reorderGroup(tabs: TabInfo[], orderedIds: string[]): TabInfo[] {
  const byId = new Map(tabs.map((t) => [t.id, t]))
  const first = orderedIds.map((id) => byId.get(id)).find((t): t is TabInfo => !!t)
  if (!first) return tabs
  const inGroup = (t: TabInfo): boolean => t.spaceId === first.spaceId && t.kind === first.kind
  const queue = orderedIds.map((id) => byId.get(id)).filter((t): t is TabInfo => !!t && inGroup(t))
  const remaining = [...queue]
  return tabs.map((t) => (inGroup(t) ? (remaining.shift() ?? t) : t))
}

export const useTabs = create<TabsState>()((set) => ({
  spaces: [],
  activeSpaceId: '',
  tabs: [],
  activeTabId: null,
  panes: [],
  paneRatios: [],
  applySnapshot: (snapshot) =>
    set({
      spaces: snapshot.spaces,
      activeSpaceId: snapshot.activeSpaceId,
      tabs: snapshot.tabs,
      activeTabId: snapshot.activeTabId,
      panes: snapshot.panes,
      paneRatios: snapshot.paneRatios,
    }),
  applyGroupOrder: (orderedIds) => set((s) => ({ tabs: reorderGroup(s.tabs, orderedIds) })),
}))

export const selectActiveTab = (s: Pick<TabsState, 'tabs' | 'activeTabId'>): TabInfo | null =>
  s.tabs.find((t) => t.id === s.activeTabId) ?? null

export const selectActiveSpace = (
  s: Pick<TabsState, 'spaces' | 'activeSpaceId'>,
): SpaceInfo | null => s.spaces.find((sp) => sp.id === s.activeSpaceId) ?? null

export function tabsOf(tabs: TabInfo[], spaceId: string, kind: TabKind): TabInfo[] {
  return tabs.filter((t) => t.spaceId === spaceId && t.kind === kind)
}
