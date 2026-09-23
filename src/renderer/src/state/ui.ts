import { create } from 'zustand'
import type {
  DisplayCaptureRequestInfo,
  DownloadInfo,
  FindResult,
  PermissionRequestInfo,
  UpdateState,
} from '@shared/models'
import type { ThemeName } from '@shared/theme'

/**
 * 'new' opens the New Tab field, 'edit' the address field, 'command' the list
 * of actions. Actions are deliberately absent from the first two: that field
 * is for reaching a page, and commands crowded out the tabs and history it is
 * meant to surface.
 */
export type PaletteMode = 'new' | 'edit' | 'command'

export interface UiState {
  /** Effective theme (resolved from the system/light/dark setting). */
  themeName: ThemeName
  setThemeName(theme: ThemeName): void
  paletteOpen: boolean
  paletteMode: PaletteMode
  /** Monotonic counter: each bump asks the URL pill to enter edit mode. */
  urlEditRequest: number
  /** Per-pane snapshots shown while an overlay hides the native views. */
  paneSnapshots: Record<string, string>

  findOpen: boolean
  findQuery: string
  findResult: FindResult | null

  downloadsOpen: boolean
  downloads: DownloadInfo[]

  settingsOpen: boolean
  historyOpen: boolean
  appStoreOpen: boolean
  notesOpen: boolean
  /** A note something asked to open; the panel selects it until you pick another. */
  notesRequestedId: number | null
  /**
   * An unwritten note: the page it is about, and a sequence so a second ⌘E
   * starts a fresh one. Nothing reaches the database until something is typed,
   * so changing your mind leaves nothing behind.
   */
  notesCompose: { url: string | null; pageTitle: string | null; seq: number } | null
  remindersOpen: boolean
  /** "Remind me about this page": the composer opens with the page attached. */
  remindersCompose: { url: string | null; pageTitle: string | null; seq: number } | null
  timesheetOpen: boolean
  updateState: UpdateState | null
  /** Version whose prominent notice was hidden with "Later" (until next launch). */
  updateNoticeDismissed: string | null

  permissionQueue: PermissionRequestInfo[]
  /** Open screen-share picker, or null. */
  displayCapture: DisplayCaptureRequestInfo | null

  /** Space editor popover: closed, create mode (spaceId null), or edit mode. */
  spaceEditor: { open: boolean; spaceId: string | null }

  openPalette(mode: PaletteMode): void
  closePalette(): void
  requestUrlEdit(): void
  setPaneSnapshots(snapshots: Record<string, string>): void

  openFind(): void
  closeFind(): void
  setFindQuery(query: string): void
  setFindResult(result: FindResult | null): void

  toggleDownloads(): void
  closeDownloads(): void
  setDownloads(list: DownloadInfo[]): void

  toggleSettings(): void
  toggleHistory(): void
  closeHistory(): void
  toggleAppStore(): void
  closeAppStore(): void
  toggleNotes(): void
  closeNotes(): void
  openNote(id: number): void
  clearNoteRequest(): void
  toggleReminders(): void
  closeReminders(): void
  composeReminder(page: { url: string | null; pageTitle: string | null }): void
  clearReminderCompose(): void
  toggleTimesheet(): void
  closeTimesheet(): void
  composeNote(page: { url: string | null; pageTitle: string | null }): void
  clearCompose(): void
  closeSettings(): void
  setUpdateState(state: UpdateState): void
  dismissUpdateNotice(version: string): void

  pushPermission(request: PermissionRequestInfo): void
  setDisplayCapture(request: DisplayCaptureRequestInfo | null): void
  shiftPermission(): void

  openSpaceEditor(spaceId: string | null): void
  closeSpaceEditor(): void
}

export const useUi = create<UiState>()((set) => ({
  themeName: 'dark',
  setThemeName: (themeName) => set({ themeName }),
  paletteOpen: false,
  paletteMode: 'new',
  urlEditRequest: 0,
  paneSnapshots: {},

  findOpen: false,
  findQuery: '',
  findResult: null,

  downloadsOpen: false,
  downloads: [],

  settingsOpen: false,
  historyOpen: false,
  appStoreOpen: false,
  notesOpen: false,
  notesRequestedId: null,
  notesCompose: null,
  remindersOpen: false,
  remindersCompose: null,
  timesheetOpen: false,
  updateState: null,
  updateNoticeDismissed: null,

  permissionQueue: [],
  displayCapture: null,

  spaceEditor: { open: false, spaceId: null },

  openPalette: (mode) => set({ paletteOpen: true, paletteMode: mode }),
  closePalette: () => set({ paletteOpen: false }),
  requestUrlEdit: () => set((s) => ({ urlEditRequest: s.urlEditRequest + 1 })),
  setPaneSnapshots: (paneSnapshots) => set({ paneSnapshots }),

  openFind: () => set({ findOpen: true }),
  closeFind: () => set({ findOpen: false, findQuery: '', findResult: null }),
  setFindQuery: (findQuery) => set({ findQuery }),
  setFindResult: (findResult) => set({ findResult }),

  toggleDownloads: () => set((s) => ({ downloadsOpen: !s.downloadsOpen, settingsOpen: false })),
  closeDownloads: () => set({ downloadsOpen: false }),
  setDownloads: (downloads) => set({ downloads }),

  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen, downloadsOpen: false })),
  closeSettings: () => set({ settingsOpen: false }),
  toggleHistory: () => set((s) => ({ historyOpen: !s.historyOpen })),
  closeHistory: () => set({ historyOpen: false }),
  toggleAppStore: () => set((s) => ({ appStoreOpen: !s.appStoreOpen, settingsOpen: false })),
  closeAppStore: () => set({ appStoreOpen: false }),
  toggleNotes: () => set((s) => ({ notesOpen: !s.notesOpen, settingsOpen: false })),
  closeNotes: () => set({ notesOpen: false }),
  openNote: (id) => set({ notesOpen: true, notesRequestedId: id, notesCompose: null }),
  composeNote: (page) =>
    set((s) => ({
      notesOpen: true,
      notesRequestedId: null,
      notesCompose: { ...page, seq: (s.notesCompose?.seq ?? 0) + 1 },
    })),
  clearCompose: () => set({ notesCompose: null }),
  clearNoteRequest: () => set({ notesRequestedId: null }),
  toggleReminders: () => set((s) => ({ remindersOpen: !s.remindersOpen, settingsOpen: false })),
  closeReminders: () => set({ remindersOpen: false, remindersCompose: null }),
  composeReminder: (page) =>
    set((s) => ({
      remindersOpen: true,
      remindersCompose: { ...page, seq: (s.remindersCompose?.seq ?? 0) + 1 },
    })),
  clearReminderCompose: () => set({ remindersCompose: null }),
  toggleTimesheet: () => set((s) => ({ timesheetOpen: !s.timesheetOpen, settingsOpen: false })),
  closeTimesheet: () => set({ timesheetOpen: false }),
  setUpdateState: (updateState) => set({ updateState }),
  dismissUpdateNotice: (updateNoticeDismissed) => set({ updateNoticeDismissed }),

  pushPermission: (request) => set((s) => ({ permissionQueue: [...s.permissionQueue, request] })),
  setDisplayCapture: (displayCapture) => set({ displayCapture }),
  shiftPermission: () => set((s) => ({ permissionQueue: s.permissionQueue.slice(1) })),

  openSpaceEditor: (spaceId) => set({ spaceEditor: { open: true, spaceId } }),
  closeSpaceEditor: () => set({ spaceEditor: { open: false, spaceId: null } }),
}))
