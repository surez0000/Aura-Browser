import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import type { InvokeChannel, InvokeMap, PushChannel, PushMap } from '@shared/ipc-contract'
import { invokeSchemas } from './schemas'

let trusted: WebContents | null = null

/** Only the chrome window's renderer may invoke Aura Browser IPC. */
export function setTrustedWebContents(wc: WebContents): void {
  trusted = wc
}

export function handleInvoke<C extends InvokeChannel>(
  channel: C,
  handler: (
    req: InvokeMap[C]['req'],
    event: IpcMainInvokeEvent,
  ) => InvokeMap[C]['res'] | Promise<InvokeMap[C]['res']>,
): void {
  ipcMain.handle(channel, (event, raw: unknown) => {
    if (!trusted || event.sender !== trusted) {
      throw new Error('aurora: IPC call from untrusted sender rejected')
    }
    const req = invokeSchemas[channel].parse(raw ?? {}) as InvokeMap[C]['req']
    return handler(req, event)
  })
}

export function pushToChrome<C extends PushChannel>(channel: C, data: PushMap[C]): void {
  if (trusted && !trusted.isDestroyed()) trusted.send(channel, data)
}
