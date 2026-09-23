import type { AuraAppId } from './apps'
import type { ReminderEntry, RepeatRule, TimesheetConfig, TimesheetEntry } from './schedule'
import type {
  AppInfo,
  ArchivedTabRow,
  AuroraSettings,
  DisplayCaptureRequestInfo,
  DownloadInfo,
  HistoryEntry,
  MiniWindowInfo,
  NoteEntry,
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
  | 'palette:command'
  | 'url:focus'
  | 'sidebar:toggle'
  | 'find:open'
  | 'find:next'
  | 'find:prev'
  | 'downloads:toggle'
  | 'space:new'
  | 'space:edit'
  | 'settings:toggle'
  | 'history:open'
  | 'split:toggle'
  | 'apps:store'
  | 'notes:open'
  | 'notes:new'
  | 'reminders:open'
  | 'reminders:new'
  | 'timesheet:open'

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
  /** History manager: a page of visits, newest first. */
  'history:list': {
    req: { query?: string; before?: number; limit?: number }
    res: HistoryEntry[]
  }
  /** Remove single visits by id, or every visit to one URL. */
  'history:delete': { req: { ids?: number[]; url?: string }; res: number }
  /** Clear visits newer than `since`; null clears everything. */
  'history:clear': { req: { since: number | null }; res: number }
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

  /**
   * Aura Apps (phase f): the catalogue plus each app's switches. The catalogue
   * is static and shared; only the switches live in the main process.
   */
  'apps:list': { req: Record<string, never>; res: AppInfo[] }
  'apps:setEnabled': { req: { id: AuraAppId; enabled: boolean }; res: void }
  'apps:setPinned': { req: { id: AuraAppId; pinned: boolean }; res: void }

  'notes:list': { req: { limit?: number }; res: NoteEntry[] }
  'notes:search': { req: { query: string; limit?: number }; res: NoteEntry[] }
  'notes:create': {
    req: { body: string; url?: string | null; pageTitle?: string | null; color?: string }
    res: NoteEntry
  }
  'notes:update': { req: { id: number; body: string }; res: NoteEntry | null }
  'notes:delete': { req: { id: number }; res: void }
  'notes:setColor': { req: { id: number; color: string }; res: NoteEntry | null }
  'notes:setPinned': { req: { id: number; pinned: boolean }; res: NoteEntry | null }

  'apps:getTimesheetConfig': { req: Record<string, never>; res: TimesheetConfig }
  'apps:setTimesheetConfig': { req: Partial<TimesheetConfig>; res: TimesheetConfig }

  'reminders:list': { req: Record<string, never>; res: ReminderEntry[] }
  'reminders:create': {
    req: {
      text: string
      dueAt: number
      repeat?: RepeatRule
      url?: string | null
      pageTitle?: string | null
    }
    res: ReminderEntry
  }
  'reminders:update': {
    req: { id: number; text: string; dueAt: number; repeat: RepeatRule }
    res: ReminderEntry | null
  }
  'reminders:complete': { req: { id: number }; res: ReminderEntry | null }
  'reminders:snooze': { req: { id: number; minutes: number }; res: ReminderEntry | null }
  'reminders:delete': { req: { id: number }; res: void }
  'reminders:clearDone': { req: Record<string, never>; res: number }

  /** The question waiting for an answer, if any, plus what to suggest. */
  'timesheet:pending': {
    req: Record<string, never>
    res: { entry: TimesheetEntry | null; question: string; lastAnswer: string | null }
  }
  'timesheet:answer': { req: { id: number; answer: string }; res: TimesheetEntry | null }
  'timesheet:skip': { req: { id: number }; res: TimesheetEntry | null }
  /** Every question asked on the local day that contains `day`. */
  'timesheet:day': { req: { day: number }; res: TimesheetEntry[] }
  'timesheet:deleteEntry': { req: { id: number }; res: void }

  /**
   * Where each on-screen pane should sit, in window coordinates (DIP). One
   * entry is the ordinary view; several are a split. The renderer measures,
   * the main process positions (ADR-0003).
   */
  'ui:setPaneBounds': {
    req: { panes: Array<{ tabId: string; x: number; y: number; width: number; height: number }> }
    res: void
  }

  /** Show `tabId` beside the focused pane; omit it for a fresh tab. */
  'tabs:split': { req: { tabId?: string }; res: void }
  /** ⌘\\: split when there is one pane, collapse to the focused one otherwise. */
  'tabs:toggleSplit': { req: Record<string, never>; res: void }
  /** Remove one pane from the split (the tab itself stays open). */
  'tabs:closePane': { req: { tabId: string }; res: void }
  /** Move keyboard focus and chrome state to a pane. */
  'tabs:focusPane': { req: { tabId: string }; res: void }
  'tabs:setPaneRatios': { req: { ratios: number[] }; res: void }

  /** Where the Peek card's page should sit; null while no Peek is open. */
  'ui:setPeekBounds': {
    req: { rect: { x: number; y: number; width: number; height: number } | null }
    res: void
  }
  'peek:close': { req: Record<string, never>; res: void }

  /** Mini window: where its page sits, and what to do with it. */
  'mini:setBounds': {
    req: { rect: { x: number; y: number; width: number; height: number } | null }
    res: void
  }
  /** Current state, fetched on mount: a push can land before the renderer subscribes. */
  'mini:get': { req: Record<string, never>; res: MiniWindowInfo | null }
  'mini:back': { req: Record<string, never>; res: void }
  'mini:close': { req: Record<string, never>; res: void }
  /** Move the page into the main window as a real tab. */
  'mini:promote': { req: Record<string, never>; res: void }
  /** Turn the Peek into a real tab in the current Space. */
  'peek:promote': { req: Record<string, never>; res: void }
  /**
   * Chrome overlays (palette, hover sidebar) render *under* native views, so
   * while an overlay is open the active view is detached and replaced by a
   * snapshot. Two phases keep the swap invisible: 'capture' returns the
   * snapshot while the view is still attached; once the chrome has painted it,
   * 'detach' removes the view. Omitting `phase` does both at once.
   */
  'ui:overlay': {
    req: { shown: boolean; phase?: 'capture' | 'detach' }
    res: { snapshots: Array<{ tabId: string; dataUrl: string }> }
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
  /** Pushed only to the mini window it describes. */
  'mini:state': MiniWindowInfo
  'apps:changed': AppInfo[]
  /** A signal to reload, plus what the rail badge shows. */
  'notes:changed': { count: number }
  'reminders:changed': ReminderEntry[]
  /** A reminder whose moment has come. */
  'reminders:due': ReminderEntry
  /** The timesheet question, freshly asked. */
  'timesheet:prompt': { entry: TimesheetEntry; question: string; lastAnswer: string | null }
  'timesheet:changed': Record<string, never>
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
  'history:list',
  'history:delete',
  'history:clear',
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
  'apps:list',
  'apps:setEnabled',
  'apps:setPinned',
  'notes:list',
  'notes:search',
  'notes:create',
  'notes:update',
  'notes:delete',
  'notes:setColor',
  'notes:setPinned',
  'apps:getTimesheetConfig',
  'apps:setTimesheetConfig',
  'reminders:list',
  'reminders:create',
  'reminders:update',
  'reminders:complete',
  'reminders:snooze',
  'reminders:delete',
  'reminders:clearDone',
  'timesheet:pending',
  'timesheet:answer',
  'timesheet:skip',
  'timesheet:day',
  'timesheet:deleteEntry',
  'ui:setPaneBounds',
  'tabs:split',
  'tabs:toggleSplit',
  'tabs:closePane',
  'tabs:focusPane',
  'tabs:setPaneRatios',
  'ui:setPeekBounds',
  'peek:close',
  'mini:setBounds',
  'mini:get',
  'mini:back',
  'mini:close',
  'mini:promote',
  'peek:promote',
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
  'mini:state',
  'apps:changed',
  'notes:changed',
  'reminders:changed',
  'reminders:due',
  'timesheet:prompt',
  'timesheet:changed',
] as const satisfies ReadonlyArray<keyof PushMap>

export type InvokeChannel = (typeof INVOKE_CHANNELS)[number]
export type PushChannel = (typeof PUSH_CHANNELS)[number]
