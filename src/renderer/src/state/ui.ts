import { create } from 'zustand'

export type PaletteMode = 'new' | 'edit'

export interface UiState {
  sidebarCollapsed: boolean
  paletteOpen: boolean
  paletteMode: PaletteMode
  /** Monotonic counter: each bump asks the URL pill to enter edit mode. */
  urlEditRequest: number
  /** Snapshot of the page shown while an overlay hides the native view. */
  pageSnapshot: string | null
  toggleSidebar(): void
  openPalette(mode: PaletteMode): void
  closePalette(): void
  requestUrlEdit(): void
  setPageSnapshot(dataUrl: string | null): void
}

export const useUi = create<UiState>()((set) => ({
  sidebarCollapsed: false,
  paletteOpen: false,
  paletteMode: 'new',
  urlEditRequest: 0,
  pageSnapshot: null,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  openPalette: (mode) => set({ paletteOpen: true, paletteMode: mode }),
  closePalette: () => set({ paletteOpen: false }),
  requestUrlEdit: () =>
    set((s) => ({ urlEditRequest: s.urlEditRequest + 1, sidebarCollapsed: false })),
  setPageSnapshot: (pageSnapshot) => set({ pageSnapshot }),
}))
