import type { InvokeMap, PushMap } from '@shared/ipc-contract'

/** Typed facade over the preload bridge. */
export function invoke<C extends keyof InvokeMap>(
  channel: C,
  req: InvokeMap[C]['req'],
): Promise<InvokeMap[C]['res']> {
  return window.aurora.invoke(channel, req) as Promise<InvokeMap[C]['res']>
}

export function on<C extends keyof PushMap>(
  channel: C,
  listener: (data: PushMap[C]) => void,
): () => void {
  return window.aurora.on(channel, (data) => listener(data as PushMap[C]))
}

/** Guarded so modules importing this file stay loadable in unit tests (Node). */
export function getPlatform(): string {
  return typeof window !== 'undefined' && window.aurora ? window.aurora.platform : 'darwin'
}

export function isMac(): boolean {
  return getPlatform() === 'darwin'
}

/** Display label for the primary modifier key. */
export function modKeyLabel(): string {
  return isMac() ? '⌘' : 'Ctrl+'
}
