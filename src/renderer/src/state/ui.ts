import { create } from 'zustand'
import type { DownloadInfo, FindResult, PermissionRequestInfo } from '@shared/models'

export type PaletteMode = 'new' | 'edit'

export interface UiState {
  sidebarCollapsed: boolean
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

  permissionQueue: PermissionRequestInfo[]

  /** Space editor popover: closed, create mode (spaceId null), or edit mode. */
  spaceEditor: { open: boolean; spaceId: string | null }

  toggleSidebar(): void
  expandSidebar(): void
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

  pushPermission(request: PermissionRequestInfo): void
  shiftPermission(): void

  openSpaceEditor(spaceId: string | null): void
  closeSpaceEditor(): void
}

export const useUi = create<UiState>()((set) => ({
  sidebarCollapsed: false,
  paletteOpen: false,
  paletteMode: 'new',
  urlEditRequest: 0,
  pageSnapshot: null,

  findOpen: false,
  findQuery: '',
  findResult: null,

  downloadsOpen: false,
  downloads: [],

  permissionQueue: [],

  spaceEditor: { open: false, spaceId: null },

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  expandSidebar: () => set({ sidebarCollapsed: false }),
  openPalette: (mode) => set({ paletteOpen: true, paletteMode: mode }),
  closePalette: () => set({ paletteOpen: false }),
  requestUrlEdit: () =>
    set((s) => ({ urlEditRequest: s.urlEditRequest + 1, sidebarCollapsed: false })),
  setPageSnapshot: (pageSnapshot) => set({ pageSnapshot }),

  openFind: () => set({ findOpen: true }),
  closeFind: () => set({ findOpen: false, findQuery: '', findResult: null }),
  setFindQuery: (findQuery) => set({ findQuery }),
  setFindResult: (findResult) => set({ findResult }),

  toggleDownloads: () => set((s) => ({ downloadsOpen: !s.downloadsOpen, sidebarCollapsed: false })),
  closeDownloads: () => set({ downloadsOpen: false }),
  setDownloads: (downloads) => set({ downloads }),

  pushPermission: (request) => set((s) => ({ permissionQueue: [...s.permissionQueue, request] })),
  shiftPermission: () => set((s) => ({ permissionQueue: s.permissionQueue.slice(1) })),

  openSpaceEditor: (spaceId) =>
    set({ spaceEditor: { open: true, spaceId }, sidebarCollapsed: false }),
  closeSpaceEditor: () => set({ spaceEditor: { open: false, spaceId: null } }),
}))
