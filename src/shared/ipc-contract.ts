import type {
  ArchivedTabRow,
  AuroraSettings,
  DisplayCaptureRequestInfo,
  DownloadInfo,
  FavoriteEntry,
  FindResult,
  HistorySearchRow,
  PermissionRequestInfo,
  TabKind,
  TabsSnapshot,
  UpdateState,
} from './models'

/**
 * The single typed IPC contract between the chrome renderer and the main
 * process. Every channel, in both directions, is declared here; the preload
 * bridge refuses anything not on these lists.
 */

/** Commands the main process asks the chrome renderer to run (menu/shortcuts). */
export type RendererCommandId =
  | 'tab:new'
  | 'url:focus'
  | 'sidebar:toggle'
  | 'find:open'
  | 'find:next'
  | 'find:prev'
  | 'downloads:toggle'
  | 'space:new'
  | 'settings:toggle'

/** invoke(channel, req) -> Promise<res> */
export interface InvokeMap {
  'tabs:create': {
    req: { url?: string; activate?: boolean; spaceId?: string; kind?: TabKind }
    res: { id: string }
  }
  'tabs:close': { req: { tabId: string }; res: void }
  'tabs:activate': { req: { tabId: string }; res: void }
  /** Reorder within one (space, kind) group; the group is inferred from the ids. */
  'tabs:reorder': { req: { orderedIds: string[] }; res: void }
  'tabs:navigate': { req: { tabId?: string; url: string }; res: void }
  'tabs:back': { req: { tabId?: string }; res: void }
  'tabs:forward': { req: { tabId?: string }; res: void }
  'tabs:reload': { req: { tabId?: string; hard?: boolean }; res: void }
  'tabs:stop': { req: { tabId?: string }; res: void }
  'tabs:reopenClosed': { req: Record<string, never>; res: void }
  'tabs:zoom': { req: { tabId?: string; direction: 'in' | 'out' | 'reset' }; res: number }
  'tabs:openDevTools': { req: { tabId?: string }; res: void }
  'tabs:setKind': { req: { tabId: string; kind: TabKind }; res: void }
  'tabs:moveToSpace': { req: { tabId: string; spaceId: string }; res: void }
  /** Archive Today tabs of the active space now (the active tab survives). */
  'tabs:archiveToday': { req: Record<string, never>; res: number }
  /** Native context menu for a sidebar tab item (renders above native views). */
  'tabs:contextMenu': { req: { tabId: string }; res: void }

  'spaces:create': {
    req: { name?: string; accentHue?: number; accentHue2?: number | null; activate?: boolean }
    res: { id: string }
  }
  'spaces:rename': { req: { spaceId: string; name: string }; res: void }
  'spaces:setAccent': {
    req: { spaceId: string; accentHue: number; accentHue2?: number | null }
    res: void
  }
  'spaces:remove': { req: { spaceId: string }; res: void }
  'spaces:activate': { req: { spaceId: string }; res: void }
  'spaces:openIncognito': { req: Record<string, never>; res: { id: string } }

  /** Favorites of the active space. */
  'favorites:add': { req: FavoriteEntry; res: void }
  'favorites:remove': { req: { url: string }; res: void }

  'history:search': { req: { query: string; limit?: number }; res: HistorySearchRow[] }
  'archive:search': { req: { query: string; limit?: number }; res: ArchivedTabRow[] }

  'find:start': { req: { text: string; forward?: boolean; findNext?: boolean }; res: void }
  'find:stop': { req: { keepSelection?: boolean }; res: void }

  'permissions:respond': { req: { id: string; allow: boolean; remember: boolean }; res: void }

  /** Screen-share picker: `sourceId: null` declines. */
  'displayCapture:respond': {
    req: { id: string; sourceId: string | null; withAudio?: boolean }
    res: void
  }
  /** macOS only: open the Screen Recording pane of System Settings. */
  'displayCapture:openSystemSettings': { req: Record<string, never>; res: void }
  'permissions:clearStored': { req: Record<string, never>; res: void }

  'downloads:list': { req: Record<string, never>; res: DownloadInfo[] }
  'downloads:action': {
    req: { id: string; action: 'open' | 'showInFolder' | 'cancel' }
    res: void
  }

  'settings:get': { req: Record<string, never>; res: AuroraSettings }
  'settings:set': { req: Partial<AuroraSettings>; res: AuroraSettings }

  /** Auto-update (electron-updater); no-ops with status 'unsupported' in dev builds. */
  'updates:get': { req: Record<string, never>; res: UpdateState }
  'updates:check': { req: Record<string, never>; res: UpdateState }
  /** Quit and install a downloaded update (status 'ready'). */
  'updates:install': { req: Record<string, never>; res: void }
  'updates:openReleases': { req: Record<string, never>; res: void }

  /** Where the page's WebContentsView should sit, in window coordinates (DIP). */
  'ui:setPageBounds': { req: { x: number; y: number; width: number; height: number }; res: void }
  /**
   * Chrome overlays (palette, hover sidebar) render *under* native views, so
   * while an overlay is open the active view is detached and replaced by a
   * snapshot. Two phases keep the swap invisible: 'capture' returns the
   * snapshot while the view is still attached; once the chrome has painted it,
   * 'detach' removes the view. Omitting `phase` does both at once.
   */
  'ui:overlay': {
    req: { shown: boolean; phase?: 'capture' | 'detach' }
    res: { snapshotDataUrl: string | null }
  }
  'window:control': { req: { action: 'minimize' | 'maximize' | 'close' }; res: void }
  'state:get': { req: Record<string, never>; res: TabsSnapshot }
}

/** Events pushed from main to the chrome renderer. */
export interface PushMap {
  'tabs:state': TabsSnapshot
  'ui:command': { id: RendererCommandId }
  'find:result': FindResult
  'permissions:request': PermissionRequestInfo
  'displayCapture:request': DisplayCaptureRequestInfo
  /** The picker must close: the requesting page went away. */
  'displayCapture:close': { id: string }
  'downloads:changed': DownloadInfo[]
  'settings:changed': AuroraSettings
  'updates:state': UpdateState
}

export const INVOKE_CHANNELS = [
  'tabs:create',
  'tabs:close',
  'tabs:activate',
  'tabs:reorder',
  'tabs:navigate',
  'tabs:back',
  'tabs:forward',
  'tabs:reload',
  'tabs:stop',
  'tabs:reopenClosed',
  'tabs:zoom',
  'tabs:openDevTools',
  'tabs:setKind',
  'tabs:moveToSpace',
  'tabs:archiveToday',
  'tabs:contextMenu',
  'spaces:create',
  'spaces:rename',
  'spaces:setAccent',
  'spaces:remove',
  'spaces:activate',
  'spaces:openIncognito',
  'favorites:add',
  'favorites:remove',
  'history:search',
  'archive:search',
  'find:start',
  'find:stop',
  'permissions:respond',
  'permissions:clearStored',
  'displayCapture:respond',
  'displayCapture:openSystemSettings',
  'downloads:list',
  'downloads:action',
  'settings:get',
  'settings:set',
  'updates:get',
  'updates:check',
  'updates:install',
  'updates:openReleases',
  'ui:setPageBounds',
  'ui:overlay',
  'window:control',
  'state:get',
] as const satisfies ReadonlyArray<keyof InvokeMap>

export const PUSH_CHANNELS = [
  'tabs:state',
  'ui:command',
  'find:result',
  'permissions:request',
  'displayCapture:request',
  'displayCapture:close',
  'downloads:changed',
  'settings:changed',
  'updates:state',
] as const satisfies ReadonlyArray<keyof PushMap>

export type InvokeChannel = (typeof INVOKE_CHANNELS)[number]
export type PushChannel = (typeof PUSH_CHANNELS)[number]
