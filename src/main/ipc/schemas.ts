import { z, type ZodType } from 'zod'
import type { InvokeChannel } from '@shared/ipc-contract'

const tabId = z.string().min(1).max(64)
const url = z.string().min(1).max(8192)
const tabIdOnly = z.object({ tabId }).strict()
const optionalTab = z.object({ tabId: tabId.optional() }).strict()
const empty = z.object({}).strict()

/**
 * Runtime validation at the IPC boundary. The chrome renderer is trusted code,
 * but it is still a renderer — defense in depth costs little.
 */
export const invokeSchemas: Record<InvokeChannel, ZodType> = {
  'tabs:create': z.object({ url: url.optional(), activate: z.boolean().optional() }).strict(),
  'tabs:close': tabIdOnly,
  'tabs:activate': tabIdOnly,
  'tabs:reorder': z.object({ orderedIds: z.array(tabId).max(1000) }).strict(),
  'tabs:navigate': z.object({ tabId: tabId.optional(), url }).strict(),
  'tabs:back': optionalTab,
  'tabs:forward': optionalTab,
  'tabs:reload': z.object({ tabId: tabId.optional(), hard: z.boolean().optional() }).strict(),
  'tabs:stop': optionalTab,
  'tabs:reopenClosed': empty,
  'tabs:zoom': z
    .object({ tabId: tabId.optional(), direction: z.enum(['in', 'out', 'reset']) })
    .strict(),
  'tabs:openDevTools': optionalTab,
  'ui:setPageBounds': z
    .object({
      x: z.number().finite(),
      y: z.number().finite(),
      width: z.number().finite().nonnegative(),
      height: z.number().finite().nonnegative(),
    })
    .strict(),
  'ui:overlay': z.object({ shown: z.boolean() }).strict(),
  'window:control': z.object({ action: z.enum(['minimize', 'maximize', 'close']) }).strict(),
  'state:get': empty,
  'favorites:list': empty,
  'favorites:add': z
    .object({
      url: url,
      title: z.string().max(512),
      faviconUrl: z.string().max(2048).nullable(),
    })
    .strict(),
  'favorites:remove': z.object({ url }).strict(),
}
