/** Security indication shown on the URL pill. */
export type SecurityState = 'secure' | 'insecure' | 'neutral'

/** Sidebar section a tab lives in. */
export type TabKind = 'pinned' | 'today'

export interface FavoriteEntry {
  url: string
  title: string
  faviconUrl: string | null
}

/** A workspace: its own favorites, pinned tabs, Today list, and accent. */
export interface SpaceInfo {
  id: string
  name: string
  /** 0–359; phase (c) maps each hue to a full aurora palette. */
  accentHue: number
  /** Ephemeral: separate in-memory session partition, never persisted. */
  incognito: boolean
  favorites: FavoriteEntry[]
}

/** A tab as the chrome UI sees it. The main process owns the source of truth. */
export interface TabInfo {
  id: string
  spaceId: string
  kind: TabKind
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
  spaces: SpaceInfo[]
  activeSpaceId: string
  /** All tabs across spaces; order within a (space, kind) group is list order. */
  tabs: TabInfo[]
  /** Active tab of the active space. */
  activeTabId: string | null
}

/** Persisted session (kv key "session"), current schema. */
export interface SessionSpaceV2 {
  id: string
  name: string
  accentHue: number
  favorites: FavoriteEntry[]
  activeIndex: number
  tabs: Array<{ url: string; title: string; faviconUrl: string | null; kind: TabKind }>
}

export interface SessionSnapshotV2 {
  version: 2
  activeSpaceId: string
  spaces: SessionSpaceV2[]
}

/** Phase (a) session shape, still readable (upgraded on load). */
export interface SessionSnapshotV1 {
  tabs: Array<{ url: string; title: string; faviconUrl: string | null }>
  activeIndex: number
}

export interface HistoryEntry {
  id: number
  url: string
  title: string
  visitedAt: number
}

/** Aggregated history row for palette search. */
export interface HistorySearchRow {
  url: string
  title: string
  visitedAt: number
  visits: number
}

export interface ArchivedTabRow {
  id: number
  url: string
  title: string
  faviconUrl: string | null
  spaceName: string
  archivedAt: number
}

export type DownloadState = 'progressing' | 'completed' | 'cancelled' | 'interrupted'

export interface DownloadInfo {
  id: string
  url: string
  filename: string
  savePath: string
  state: DownloadState
  receivedBytes: number
  totalBytes: number
  startedAt: number
}

export interface PermissionRequestInfo {
  id: string
  host: string
  permission: string
  description: string
}

export interface FindResult {
  activeMatchOrdinal: number
  matches: number
}

export interface AuroraSettings {
  /** Today tabs idle longer than this are auto-archived; 0 disables. */
  todayArchiveHours: number
}

export const DEFAULT_SETTINGS: AuroraSettings = { todayArchiveHours: 12 }
