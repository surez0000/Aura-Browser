import type { FavoriteEntry, TabsSnapshot } from './models'

/**
 * The single typed IPC contract between the chrome renderer and the main
 * process. Every channel, in both directions, is declared here; the preload
 * bridge refuses anything not on these lists.
 */

/** Commands the main process asks the chrome renderer to run (menu/shortcuts). */
export type RendererCommandId = 'tab:new' | 'url:focus' | 'sidebar:toggle'

/** invoke(channel, req) -> Promise<res> */
export interface InvokeMap {
  'tabs:create': { req: { url?: string; activate?: boolean }; res: { id: string } }
  'tabs:close': { req: { tabId: string }; res: void }
  'tabs:activate': { req: { tabId: string }; res: void }
  'tabs:reorder': { req: { orderedIds: string[] }; res: void }
  /** tabId omitted = active tab. url must be http(s) or about:blank. */
  'tabs:navigate': { req: { tabId?: string; url: string }; res: void }
  'tabs:back': { req: { tabId?: string }; res: void }
  'tabs:forward': { req: { tabId?: string }; res: void }
  'tabs:reload': { req: { tabId?: string; hard?: boolean }; res: void }
  'tabs:stop': { req: { tabId?: string }; res: void }
  'tabs:reopenClosed': { req: Record<string, never>; res: void }
  'tabs:zoom': { req: { tabId?: string; direction: 'in' | 'out' | 'reset' }; res: number }
  'tabs:openDevTools': { req: { tabId?: string }; res: void }
  /** Where the page's WebContentsView should sit, in window coordinates (DIP). */
  'ui:setPageBounds': { req: { x: number; y: number; width: number; height: number }; res: void }
  /**
   * Chrome overlays (palette, dialogs) render *under* native views, so while an
   * overlay is open the active view is detached and replaced by a snapshot.
   */
  'ui:overlay': { req: { shown: boolean }; res: { snapshotDataUrl: string | null } }
  'window:control': { req: { action: 'minimize' | 'maximize' | 'close' }; res: void }
  'state:get': { req: Record<string, never>; res: TabsSnapshot }
  'favorites:list': { req: Record<string, never>; res: FavoriteEntry[] }
  'favorites:add': { req: FavoriteEntry; res: FavoriteEntry[] }
  'favorites:remove': { req: { url: string }; res: FavoriteEntry[] }
}

/** Events pushed from main to the chrome renderer. */
export interface PushMap {
  'tabs:state': TabsSnapshot
  'ui:command': { id: RendererCommandId }
  'favorites:changed': FavoriteEntry[]
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
  'ui:setPageBounds',
  'ui:overlay',
  'window:control',
  'state:get',
  'favorites:list',
  'favorites:add',
  'favorites:remove',
] as const satisfies ReadonlyArray<keyof InvokeMap>

export const PUSH_CHANNELS = [
  'tabs:state',
  'ui:command',
  'favorites:changed',
] as const satisfies ReadonlyArray<keyof PushMap>

export type InvokeChannel = (typeof INVOKE_CHANNELS)[number]
export type PushChannel = (typeof PUSH_CHANNELS)[number]
