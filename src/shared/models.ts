import type { SearchEngineId } from './search'
import type { ThemeMode } from './theme'

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
  /** 0–359; drives the accent and the first half of the aurora mesh. */
  accentHue: number
  /**
   * Second gradient stop (0–359). Together with `accentHue` it gives each
   * Space its own gradient, the way Arc does. Absent on Spaces created before
   * gradients existed — the palette then derives one from `accentHue`.
   */
  accentHue2: number | null
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
  /** Main document parsed (dom-ready) — the load bar jumps ahead here. */
  domReady: boolean
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

/** Persisted session (kv key "session"), phase (b) schema; upgraded on load. */
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

/**
 * Current schema: every Space names its storage partition (ADR-0004). '' is
 * Electron's default session (kept by the first Space of an upgraded profile);
 * new Spaces get `persist:space:<id>`.
 */
export interface SessionSpaceV3 extends SessionSpaceV2 {
  partition: string
  /** Second gradient stop; absent on Spaces saved before gradients. */
  accentHue2?: number | null
}

export interface SessionSnapshotV3 {
  version: 3
  activeSpaceId: string
  spaces: SessionSpaceV3[]
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

/** One screen or window offered by the screen-share picker. */
export interface DisplayCaptureSource {
  id: string
  name: string
  kind: 'screen' | 'window'
  thumbnailDataUrl: string
  appIconDataUrl: string | null
}

export interface DisplayCaptureRequestInfo {
  id: string
  /** Host asking to capture, for the picker's headline. */
  host: string
  sources: DisplayCaptureSource[]
  /** True until the source list has been enumerated (it can take seconds). */
  loading: boolean
  /** macOS gates screen capture on a system grant we cannot give ourselves. */
  systemPermission: 'granted' | 'denied'
  /** System audio capture (Windows loopback only). */
  canShareAudio: boolean
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

/**
 * 'fixed'   — the full sidebar sits in the layout.
 * 'compact' — a narrow rail of tab favicons, also in the layout: the page is
 *             never covered, so nothing has to slide in or out.
 * 'hover' is the retired show-on-hover mode, normalised to 'compact' on load.
 */
export type SidebarMode = 'fixed' | 'compact'

export interface AuroraSettings {
  /** Today tabs idle longer than this are auto-archived; 0 disables. */
  todayArchiveHours: number
  /** Appearance: follow the OS or force light/dark. */
  theme: ThemeMode
  /** Provider used when palette / address input is not a URL. */
  searchEngine: SearchEngineId
  /**
   * 'fixed' keeps the sidebar in the layout; 'hover' hides it until the
   * pointer touches the left edge, then floats it over the page.
   */
  sidebarMode: SidebarMode
}

export const DEFAULT_SETTINGS: AuroraSettings = {
  todayArchiveHours: 12,
  theme: 'system',
  searchEngine: 'duckduckgo',
  sidebarMode: 'fixed',
}

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'up-to-date'
  | 'error'
  | 'unsupported'

/** Auto-update state, owned by the main process and mirrored in the chrome. */
export interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  availableVersion: string | null
  /** Download progress 0–100 while 'downloading'. */
  percent: number | null
  /** Human-readable detail for 'error' / 'unsupported'. */
  message: string | null
  /** The release page, when a publish target is configured. */
  releasesUrl: string | null
  /** Milliseconds since epoch of the last completed check. */
  checkedAt: number | null
}
