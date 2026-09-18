import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import type { InvokeChannel, InvokeMap, PushChannel, PushMap } from '@shared/ipc-contract'
import { invokeSchemas } from './schemas'

/**
 * Only Aura Browser's own chrome renderers may invoke IPC — the main shell and
 * any mini windows. Page renderers get no preload at all, so nothing a site
 * loads can reach these channels.
 */
const trusted = new Set<WebContents>()
let primary: WebContents | null = null

/** The main shell window: the target of `pushToChrome`. */
export function setTrustedWebContents(wc: WebContents): void {
  primary = wc
  addTrustedWebContents(wc)
}

export function addTrustedWebContents(wc: WebContents): void {
  trusted.add(wc)
  wc.once('destroyed', () => trusted.delete(wc))
}

export function handleInvoke<C extends InvokeChannel>(
  channel: C,
  handler: (
    req: InvokeMap[C]['req'],
    event: IpcMainInvokeEvent,
  ) => InvokeMap[C]['res'] | Promise<InvokeMap[C]['res']>,
): void {
  ipcMain.handle(channel, (event, raw: unknown) => {
    if (!trusted.has(event.sender)) {
      throw new Error('aurora: IPC call from untrusted sender rejected')
    }
    const req = invokeSchemas[channel].parse(raw ?? {}) as InvokeMap[C]['req']
    return handler(req, event)
  })
}

export function pushToChrome<C extends PushChannel>(channel: C, data: PushMap[C]): void {
  if (primary && !primary.isDestroyed()) primary.send(channel, data)
}

/** Push to one specific chrome renderer (a mini window). */
export function pushTo<C extends PushChannel>(wc: WebContents, channel: C, data: PushMap[C]): void {
  if (!wc.isDestroyed()) wc.send(channel, data)
}
