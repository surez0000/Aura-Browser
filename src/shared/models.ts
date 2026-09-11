/** Security indication shown on the URL pill. */
export type SecurityState = 'secure' | 'insecure' | 'neutral'

/** A tab as the chrome UI sees it. The main process owns the source of truth. */
export interface TabInfo {
  id: string
  /** Current committed URL ('' while nothing has loaded yet). */
  url: string
  /** URL waiting to load lazily (session-restored tabs load on first activation). */
  pendingUrl: string | null
  title: string
  faviconUrl: string | null
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  crashed: boolean
  security: SecurityState
  zoomPercent: number
}

export interface TabsSnapshot {
  tabs: TabInfo[]
  activeTabId: string | null
}

export interface FavoriteEntry {
  url: string
  title: string
  faviconUrl: string | null
}

/** Persisted session shape (kv key: "session"). */
export interface SessionSnapshot {
  tabs: Array<{ url: string; title: string; faviconUrl: string | null }>
  activeIndex: number
}

export interface HistoryEntry {
  id: number
  url: string
  title: string
  visitedAt: number
}
