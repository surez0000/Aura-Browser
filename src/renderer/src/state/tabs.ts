import { create } from 'zustand'
import type { FavoriteEntry, TabInfo, TabsSnapshot } from '@shared/models'

export interface TabsState {
  tabs: TabInfo[]
  activeTabId: string | null
  favorites: FavoriteEntry[]
  applySnapshot(snapshot: TabsSnapshot): void
  setFavorites(favorites: FavoriteEntry[]): void
  /** Optimistic order while a drag is in flight; main confirms via push. */
  setLocalOrder(tabs: TabInfo[]): void
}

export const useTabs = create<TabsState>()((set) => ({
  tabs: [],
  activeTabId: null,
  favorites: [],
  applySnapshot: (snapshot) => set({ tabs: snapshot.tabs, activeTabId: snapshot.activeTabId }),
  setFavorites: (favorites) => set({ favorites }),
  setLocalOrder: (tabs) => set({ tabs }),
}))

export const selectActiveTab = (s: Pick<TabsState, 'tabs' | 'activeTabId'>): TabInfo | null =>
  s.tabs.find((t) => t.id === s.activeTabId) ?? null
