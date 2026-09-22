import type { SearchEngineId } from './search'
import type { ThemeMode } from './theme'
import type { AuraAppId } from './apps'

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
  /** Focused pane's tab in the active space. */
  activeTabId: string | null
  /**
   * Tabs on screen in the active space, left to right. One entry is the
   * ordinary single-page view; two to four are a split (phase d).
   */
  panes: string[]
  /** Width of each pane as a fraction of the page area; sums to 1. */
  paneRatios: number[]
  /** The open Peek, if any. */
  peek: PeekInfo | null
}

/** Largest split the layout offers. */
export const MAX_PANES = 4

/**
 * A Peek: a link previewed in a floating card over the page, without taking a
 * tab. Shift-clicking a link opens one; it can be promoted to a real tab.
 */
/** An installed Chrome extension, as the extensions manager shows it. */
export interface ExtensionInfo {
  id: string
  name: string
  version: string
  /** Loaded into the browsing sessions right now. */
  enabled: boolean
  /** Added from a folder rather than the Chrome Web Store. */
  unpacked: boolean
  iconDataUrl: string | null
}

/** State of a mini window, pushed to that window's own chrome renderer. */
export interface MiniWindowInfo {
  url: string
  title: string
  isLoading: boolean
  canGoBack: boolean
}

export interface PeekInfo {
  tabId: string
  url: string
  title: string
  isLoading: boolean
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
  /** Indices into `tabs` that were on screen as a split; absent = single pane. */
  paneIndices?: number[]
  paneRatios?: number[]
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
   * Allow installing extensions straight from the Chrome Web Store. Off by
   * default: that integration registers a preload script on every page in the
   * session, which the deny-by-default posture would otherwise rule out.
   */
  webStoreInstalls: boolean
  /**
   * 'fixed' keeps the sidebar in the layout; 'compact' shrinks it to a rail of
   * tab favicons. ('hover' is retired and normalised to 'compact'.)
   */
  sidebarMode: SidebarMode
  /**
   * Texture drawn over the Space gradient. 'grain' is a fine static noise, in
   * the spirit of Arc; 'particles' is a slow drifting dot field. Off by
   * default, so the gradient is clean unless it is asked for.
   */
  backdropTexture: BackdropTexture
  /**
   * Where the tabs live. 'side' is the Arc-style sidebar list; 'top' is the
   * traditional strip across the window, with navigation and the address field
   * beside it. Spaces, favorites, downloads and settings stay on the left rail
   * either way — Space switching is the point of the browser, not a detail to
   * bury in a menu.
   */
  tabBar: TabBarPosition
}

/** @see AuroraSettings.tabBar */
export type TabBarPosition = 'side' | 'top'

export const TAB_BAR_POSITIONS = ['side', 'top'] as const satisfies ReadonlyArray<TabBarPosition>

/** @see AuroraSettings.backdropTexture */
export type BackdropTexture = 'none' | 'grain' | 'particles'

export const BACKDROP_TEXTURES = [
  'none',
  'grain',
  'particles',
] as const satisfies ReadonlyArray<BackdropTexture>

export const DEFAULT_SETTINGS: AuroraSettings = {
  todayArchiveHours: 12,
  theme: 'system',
  searchEngine: 'duckduckgo',
  webStoreInstalls: false,
  sidebarMode: 'fixed',
  backdropTexture: 'none',
  tabBar: 'side',
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

/** An Aura App as the chrome sees it: its catalogue entry plus its switches. */
export interface AppInfo {
  id: AuraAppId
  name: string
  tagline: string
  description: string
  available: boolean
  enabled: boolean
  pinned: boolean
}

/**
 * A note. Global, not per Space: a thought you had in one Space is still worth
 * finding from another. It remembers the page it was taken on, which is what
 * makes it findable later by what you were reading.
 */
export interface NoteEntry {
  id: number
  /** First line, kept separate so lists and search do not load every body. */
  title: string
  body: string
  url: string | null
  pageTitle: string | null
  createdAt: number
  updatedAt: number
}
