import { invoke } from '@/lib/ipc'
import { useUi } from '@/state/ui'

/**
 * Ref-counted page overlay (ADR-0003). Chrome HTML renders *under* the page's
 * native view, so anything that must appear over the page — the palette, the
 * hover sidebar — asks main to detach the view and hands PageCard a snapshot.
 * Counting holders keeps the view detached while any overlay is up, so closing
 * one overlay never reattaches the page under another.
 */
const holders = new Set<string>()

export async function holdOverlay(key: string): Promise<void> {
  const first = holders.size === 0
  holders.add(key)
  if (!first) return
  const { snapshotDataUrl } = await invoke('ui:overlay', { shown: true })
  // Released while the snapshot was in flight — main already reattached.
  if (holders.size > 0) useUi.getState().setPageSnapshot(snapshotDataUrl)
}

export function releaseOverlay(key: string): void {
  if (!holders.delete(key) || holders.size > 0) return
  useUi.getState().setPageSnapshot(null)
  void invoke('ui:overlay', { shown: false })
}

export function overlayHeld(): boolean {
  return holders.size > 0
}
