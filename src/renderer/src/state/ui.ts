import { create } from 'zustand'
import type { DownloadInfo, FindResult, PermissionRequestInfo, UpdateState } from '@shared/models'
import type { ThemeName } from '@shared/theme'

export type PaletteMode = 'new' | 'edit'

export interface UiState {
  /** Effective theme (resolved from the system/light/dark setting). */
  themeName: ThemeName
  setThemeName(theme: ThemeName): void
  /**
   * Show-on-hover sidebar: true while the panel floats over the page. Ignored
   * in fixed mode. Popovers and ⌘L reveal it; leaving the panel hides it.
   */
  sidebarRevealed: boolean
  setSidebarRevealed(revealed: boolean): void
  /** Pointer is over the sidebar panel (hover mode uses it to decide when to hide). */
  sidebarPointerInside: boolean
  setSidebarPointerInside(inside: boolean): void
  /**
   * Switching fixed → hover while the panel is in use keeps the panel in the
   * layout (no page overlap, no snapshot) until it hides for the first time;
   * the page then grows once, live. Prevents the snapshot stretching under a
   * layout spring.
   */
  sidebarHoldLayout: boolean
  setSidebarHoldLayout(hold: boolean): void
  paletteOpen: boolean
  paletteMode: PaletteMode
  /** Monotonic counter: each bump asks the URL pill to enter edit mode. */
  urlEditRequest: number
  /** Snapshot of the page shown while an overlay hides the native view. */
  pageSnapshot: string | null

  findOpen: boolean
  findQuery: string
  findResult: FindResult | null

  downloadsOpen: boolean
  downloads: DownloadInfo[]

  settingsOpen: boolean
  updateState: UpdateState | null
  /** Version whose prominent notice was hidden with "Later" (until next launch). */
  updateNoticeDismissed: string | null

  permissionQueue: PermissionRequestInfo[]

  /** Space editor popover: closed, create mode (spaceId null), or edit mode. */
  spaceEditor: { open: boolean; spaceId: string | null }

  openPalette(mode: PaletteMode): void
  closePalette(): void
  requestUrlEdit(): void
  setPageSnapshot(dataUrl: string | null): void

  openFind(): void
  closeFind(): void
  setFindQuery(query: string): void
  setFindResult(result: FindResult | null): void

  toggleDownloads(): void
  closeDownloads(): void
  setDownloads(list: DownloadInfo[]): void

  toggleSettings(): void
  closeSettings(): void
  setUpdateState(state: UpdateState): void
  dismissUpdateNotice(version: string): void

  pushPermission(request: PermissionRequestInfo): void
  shiftPermission(): void

  openSpaceEditor(spaceId: string | null): void
  closeSpaceEditor(): void
}

export const useUi = create<UiState>()((set) => ({
  themeName: 'dark',
  setThemeName: (themeName) => set({ themeName }),
  sidebarRevealed: false,
  setSidebarRevealed: (sidebarRevealed) =>
    set(sidebarRevealed ? { sidebarRevealed } : { sidebarRevealed, sidebarHoldLayout: false }),
  sidebarPointerInside: false,
  setSidebarPointerInside: (sidebarPointerInside) => set({ sidebarPointerInside }),
  sidebarHoldLayout: false,
  setSidebarHoldLayout: (sidebarHoldLayout) => set({ sidebarHoldLayout }),
  paletteOpen: false,
  paletteMode: 'new',
  urlEditRequest: 0,
  pageSnapshot: null,

  findOpen: false,
  findQuery: '',
  findResult: null,

  downloadsOpen: false,
  downloads: [],

  settingsOpen: false,
  updateState: null,
  updateNoticeDismissed: null,

  permissionQueue: [],

  spaceEditor: { open: false, spaceId: null },

  openPalette: (mode) => set({ paletteOpen: true, paletteMode: mode }),
  closePalette: () => set({ paletteOpen: false }),
  requestUrlEdit: () =>
    set((s) => ({ urlEditRequest: s.urlEditRequest + 1, sidebarRevealed: true })),
  setPageSnapshot: (pageSnapshot) => set({ pageSnapshot }),

  openFind: () => set({ findOpen: true }),
  closeFind: () => set({ findOpen: false, findQuery: '', findResult: null }),
  setFindQuery: (findQuery) => set({ findQuery }),
  setFindResult: (findResult) => set({ findResult }),

  toggleDownloads: () =>
    set((s) => ({ downloadsOpen: !s.downloadsOpen, settingsOpen: false, sidebarRevealed: true })),
  closeDownloads: () => set({ downloadsOpen: false }),
  setDownloads: (downloads) => set({ downloads }),

  toggleSettings: () =>
    set((s) => ({ settingsOpen: !s.settingsOpen, downloadsOpen: false, sidebarRevealed: true })),
  closeSettings: () => set({ settingsOpen: false }),
  setUpdateState: (updateState) => set({ updateState }),
  dismissUpdateNotice: (updateNoticeDismissed) => set({ updateNoticeDismissed }),

  pushPermission: (request) => set((s) => ({ permissionQueue: [...s.permissionQueue, request] })),
  shiftPermission: () => set((s) => ({ permissionQueue: s.permissionQueue.slice(1) })),

  openSpaceEditor: (spaceId) =>
    set({ spaceEditor: { open: true, spaceId }, sidebarRevealed: true }),
  closeSpaceEditor: () => set({ spaceEditor: { open: false, spaceId: null } }),
}))
