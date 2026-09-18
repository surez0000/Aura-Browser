import { invoke } from '@/lib/ipc'
import { useUi } from '@/state/ui'

/**
 * Ref-counted page overlay (ADR-0003). Chrome HTML renders *under* the page's
 * native view, so anything that must appear over the page — the palette, the
 * hover sidebar — asks main to detach the view and hands PageCard a snapshot.
 *
 * The swap is two-phase so it never blinks: main captures while the view is
 * still attached, the chrome decodes and paints the snapshot underneath, and
 * only then is the view removed. On release the view comes back first and the
 * snapshot is dropped a moment later, hidden beneath it.
 *
 * Counting holders keeps the view detached while any overlay is up, so closing
 * one overlay never reattaches the page under another.
 */
const holders = new Set<string>()
/** Bumped by every release; a hold that spans a release must stop. */
let generation = 0

const nextFrames = (n: number): Promise<void> =>
  new Promise((resolve) => {
    const step = (left: number): void => {
      if (left <= 0) resolve()
      else requestAnimationFrame(() => step(left - 1))
    }
    step(n)
  })

async function decode(dataUrl: string): Promise<void> {
  const img = new Image()
  img.src = dataUrl
  try {
    await img.decode()
  } catch {
    // Paint it anyway; a failed decode just means no pre-warm.
  }
}

export async function holdOverlay(key: string): Promise<void> {
  const first = holders.size === 0
  holders.add(key)
  if (!first) return
  const gen = generation
  const { snapshots } = await invoke('ui:overlay', { shown: true, phase: 'capture' })
  if (gen !== generation || holders.size === 0) return
  if (snapshots.length > 0) {
    await Promise.all(snapshots.map((s) => decode(s.dataUrl)))
    if (gen !== generation || holders.size === 0) return
    useUi
      .getState()
      .setPaneSnapshots(Object.fromEntries(snapshots.map((s) => [s.tabId, s.dataUrl])))
    await nextFrames(2)
    if (gen !== generation || holders.size === 0) return
  }
  await invoke('ui:overlay', { shown: true, phase: 'detach' })
}

export function releaseOverlay(key: string): void {
  if (!holders.delete(key) || holders.size > 0) return
  generation += 1
  const gen = generation
  void invoke('ui:overlay', { shown: false }).then(() => {
    // The live view is above the snapshot again; give it a beat to paint.
    window.setTimeout(() => {
      if (gen === generation && holders.size === 0) useUi.getState().setPaneSnapshots({})
    }, 120)
  })
}

export function overlayHeld(): boolean {
  return holders.size > 0
}
