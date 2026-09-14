import { create } from 'zustand'
import { DEFAULT_SETTINGS, type AuroraSettings } from '@shared/models'
import { invoke } from '@/lib/ipc'

/**
 * Mirror of the main process's persisted settings. Writes are optimistic and
 * reconciled with main's reply; main also pushes `settings:changed` so other
 * writers (menu, future windows) stay in sync.
 */
export interface SettingsState {
  settings: AuroraSettings
  loaded: boolean
  apply(settings: AuroraSettings): void
  update(patch: Partial<AuroraSettings>): Promise<void>
}

export const useSettings = create<SettingsState>()((set) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  apply: (settings) => set({ settings, loaded: true }),
  update: async (patch) => {
    set((s) => ({ settings: { ...s.settings, ...patch } }))
    const settings = await invoke('settings:set', patch)
    set({ settings, loaded: true })
  },
}))

export const selectSearchEngine = (s: SettingsState): AuroraSettings['searchEngine'] =>
  s.settings.searchEngine
export const selectSidebarMode = (s: SettingsState): AuroraSettings['sidebarMode'] =>
  s.settings.sidebarMode
