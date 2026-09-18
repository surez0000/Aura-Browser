import { create } from 'zustand'
import { DEFAULT_SETTINGS, type AuroraSettings } from '@shared/models'
import { invoke } from '@/lib/ipc'

/**
 * Mirror of the main process's persisted settings. Writes are optimistic and
 * reconciled with main's reply; main also pushes `settings:changed` so other
 * writers (menu, future windows) stay in sync.
 *
 * Ordering matters when two writes overlap (⌘S twice within a few frames): a
 * reply or push belonging to the older write must not undo the newer
 * optimistic state. Each write takes a sequence number and only the latest
 * reply is applied; pushes are ignored while any write is in flight, because
 * the reply to that write already carries the full, current settings.
 */
export interface SettingsState {
  settings: AuroraSettings
  loaded: boolean
  apply(settings: AuroraSettings): void
  update(patch: Partial<AuroraSettings>): Promise<void>
}

export const useSettings = create<SettingsState>()((set) => {
  let writeSeq = 0
  let inflight = 0
  return {
    settings: DEFAULT_SETTINGS,
    loaded: false,
    apply: (settings) => {
      if (inflight > 0) return
      set({ settings, loaded: true })
    },
    update: async (patch) => {
      const seq = ++writeSeq
      inflight += 1
      set((s) => ({ settings: { ...s.settings, ...patch } }))
      try {
        const settings = await invoke('settings:set', patch)
        if (seq === writeSeq) set({ settings, loaded: true })
      } finally {
        inflight -= 1
      }
    },
  }
})

export const selectSearchEngine = (s: SettingsState): AuroraSettings['searchEngine'] =>
  s.settings.searchEngine
export const selectSidebarMode = (s: SettingsState): AuroraSettings['sidebarMode'] =>
  s.settings.sidebarMode

export const selectBackdropTexture = (s: SettingsState): AuroraSettings['backdropTexture'] =>
  s.settings.backdropTexture
