import { z, type ZodType } from 'zod'
import { SEARCH_ENGINE_IDS } from '@shared/search'
import { BACKDROP_TEXTURES } from '@shared/models'
import type { InvokeChannel } from '@shared/ipc-contract'

const id = z.string().min(1).max(64)
const url = z.string().min(1).max(8192)
const tabIdOnly = z.object({ tabId: id }).strict()
const optionalTab = z.object({ tabId: id.optional() }).strict()
const empty = z.object({}).strict()
const kind = z.enum(['pinned', 'today'])

/**
 * Runtime validation at the IPC boundary. The chrome renderer is trusted code,
 * but it is still a renderer — defense in depth costs little.
 */
export const invokeSchemas: Record<InvokeChannel, ZodType> = {
  'tabs:create': z
    .object({
      url: url.optional(),
      activate: z.boolean().optional(),
      spaceId: id.optional(),
      kind: kind.optional(),
    })
    .strict(),
  'tabs:close': tabIdOnly,
  'tabs:activate': tabIdOnly,
  'tabs:reorder': z.object({ orderedIds: z.array(id).max(1000) }).strict(),
  'tabs:navigate': z.object({ tabId: id.optional(), url }).strict(),
  'tabs:back': optionalTab,
  'tabs:forward': optionalTab,
  'tabs:reload': z.object({ tabId: id.optional(), hard: z.boolean().optional() }).strict(),
  'tabs:stop': optionalTab,
  'tabs:reopenClosed': empty,
  'tabs:zoom': z
    .object({ tabId: id.optional(), direction: z.enum(['in', 'out', 'reset']) })
    .strict(),
  'tabs:openDevTools': optionalTab,
  'tabs:setKind': z.object({ tabId: id, kind }).strict(),
  'tabs:moveToSpace': z.object({ tabId: id, spaceId: id }).strict(),
  'tabs:archiveToday': empty,
  'tabs:contextMenu': tabIdOnly,

  'spaces:create': z
    .object({
      name: z.string().max(40).optional(),
      accentHue: z.number().int().min(0).max(359).optional(),
      accentHue2: z.number().int().min(0).max(359).nullable().optional(),
      activate: z.boolean().optional(),
    })
    .strict(),
  'spaces:rename': z.object({ spaceId: id, name: z.string().min(1).max(40) }).strict(),
  'spaces:setAccent': z
    .object({
      spaceId: id,
      accentHue: z.number().int().min(0).max(359),
      accentHue2: z.number().int().min(0).max(359).nullable().optional(),
    })
    .strict(),
  'spaces:remove': z.object({ spaceId: id }).strict(),
  'spaces:activate': z.object({ spaceId: id }).strict(),
  'spaces:openIncognito': empty,

  'favorites:add': z
    .object({
      url,
      title: z.string().max(512),
      faviconUrl: z.string().max(2048).nullable(),
    })
    .strict(),
  'favorites:remove': z.object({ url }).strict(),

  'history:search': z
    .object({ query: z.string().max(512), limit: z.number().int().min(1).max(50).optional() })
    .strict(),
  'history:list': z
    .object({
      query: z.string().max(512).optional(),
      before: z.number().int().nonnegative().optional(),
      limit: z.number().int().min(1).max(500).optional(),
    })
    .strict(),
  'history:delete': z
    .object({
      ids: z.array(z.number().int().nonnegative()).max(500).optional(),
      url: z.string().max(8192).optional(),
    })
    .strict(),
  'history:clear': z.object({ since: z.number().int().nonnegative().nullable() }).strict(),

  'archive:search': z
    .object({ query: z.string().max(512), limit: z.number().int().min(1).max(50).optional() })
    .strict(),

  'find:start': z
    .object({
      text: z.string().min(1).max(512),
      forward: z.boolean().optional(),
      findNext: z.boolean().optional(),
    })
    .strict(),
  'find:stop': z.object({ keepSelection: z.boolean().optional() }).strict(),

  'permissions:respond': z.object({ id, allow: z.boolean(), remember: z.boolean() }).strict(),
  'permissions:clearStored': empty,

  'displayCapture:respond': z
    .object({ id, sourceId: z.string().max(512).nullable(), withAudio: z.boolean().optional() })
    .strict(),
  'displayCapture:openSystemSettings': empty,

  'downloads:list': empty,
  'downloads:action': z.object({ id, action: z.enum(['open', 'showInFolder', 'cancel']) }).strict(),

  'extensions:list': empty,
  'extensions:setEnabled': z.object({ id, enabled: z.boolean() }).strict(),
  'extensions:remove': z.object({ id }).strict(),
  'extensions:addUnpacked': empty,
  'extensions:openStore': empty,
  'extensions:checkUpdates': empty,

  'settings:get': empty,
  'settings:set': z
    .object({
      todayArchiveHours: z
        .number()
        .min(0)
        .max(24 * 30)
        .optional(),
      theme: z.enum(['system', 'light', 'dark']).optional(),
      searchEngine: z.enum(SEARCH_ENGINE_IDS).optional(),
      // 'hover' is retired but still accepted from older builds; normalised in main.
      sidebarMode: z.enum(['fixed', 'compact', 'hover']).optional(),
      webStoreInstalls: z.boolean().optional(),
      backdropTexture: z.enum(BACKDROP_TEXTURES).optional(),
    })
    .strict(),

  'updates:get': empty,
  'updates:check': empty,
  'updates:install': empty,
  'updates:openReleases': empty,

  'ui:setPaneBounds': z
    .object({
      panes: z
        .array(
          z
            .object({
              tabId: id,
              x: z.number().finite(),
              y: z.number().finite(),
              width: z.number().finite().nonnegative(),
              height: z.number().finite().nonnegative(),
            })
            .strict(),
        )
        .max(8),
    })
    .strict(),

  'tabs:split': z.object({ tabId: id.optional() }).strict(),
  'tabs:toggleSplit': empty,
  'tabs:closePane': z.object({ tabId: id }).strict(),
  'tabs:focusPane': z.object({ tabId: id }).strict(),
  'tabs:setPaneRatios': z
    .object({ ratios: z.array(z.number().finite().positive()).min(1).max(8) })
    .strict(),

  'ui:setPeekBounds': z
    .object({
      rect: z
        .object({
          x: z.number().finite(),
          y: z.number().finite(),
          width: z.number().finite().nonnegative(),
          height: z.number().finite().nonnegative(),
        })
        .strict()
        .nullable(),
    })
    .strict(),
  'peek:close': empty,
  'mini:setBounds': z
    .object({
      rect: z
        .object({
          x: z.number().finite(),
          y: z.number().finite(),
          width: z.number().finite().nonnegative(),
          height: z.number().finite().nonnegative(),
        })
        .strict()
        .nullable(),
    })
    .strict(),
  'mini:get': empty,
  'mini:back': empty,
  'mini:close': empty,
  'mini:promote': empty,
  'peek:promote': empty,
  'ui:overlay': z
    .object({ shown: z.boolean(), phase: z.enum(['capture', 'detach']).optional() })
    .strict(),
  'window:control': z.object({ action: z.enum(['minimize', 'maximize', 'close']) }).strict(),
  'state:get': empty,
}
