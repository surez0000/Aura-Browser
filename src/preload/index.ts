import { contextBridge, ipcRenderer } from 'electron'
import { INVOKE_CHANNELS, PUSH_CHANNELS } from '../shared/ipc-contract'

const invokeChannels: ReadonlySet<string> = new Set(INVOKE_CHANNELS)
const pushChannels: ReadonlySet<string> = new Set(PUSH_CHANNELS)

const api = {
  platform: process.platform as string,

  invoke(channel: string, payload: unknown): Promise<unknown> {
    if (!invokeChannels.has(channel)) {
      return Promise.reject(new Error(`aurora: unknown invoke channel "${channel}"`))
    }
    return ipcRenderer.invoke(channel, payload)
  },

  on(channel: string, listener: (data: unknown) => void): () => void {
    if (!pushChannels.has(channel)) {
      throw new Error(`aurora: unknown push channel "${channel}"`)
    }
    const wrapped = (_event: Electron.IpcRendererEvent, data: unknown): void => listener(data)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  },
}

export type AuroraBridge = typeof api

contextBridge.exposeInMainWorld('aurora', api)
