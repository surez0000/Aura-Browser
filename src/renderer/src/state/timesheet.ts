import { create } from 'zustand'
import type { TimesheetConfig, TimesheetEntry } from '@shared/schedule'

export interface TimesheetPrompt {
  entry: TimesheetEntry
  question: string
  lastAnswer: string | null
}

/**
 * The question on screen, if any, and the schedule it follows. `changed` is a
 * counter the day view watches so it reloads when an answer lands.
 *
 * `logging` is the bar for unplanned work, opened by hand between questions;
 * `logFocus` counts the asks to type into it, so asking again while it is
 * already open (or while the day view holds its own line) puts the caret back.
 */
export interface TimesheetState {
  prompt: TimesheetPrompt | null
  config: TimesheetConfig | null
  changed: number
  logging: boolean
  logFocus: number
  setPrompt(prompt: TimesheetPrompt | null): void
  setConfig(config: TimesheetConfig): void
  bump(): void
  openLog(): void
  closeLog(): void
  focusLog(): void
}

export const useTimesheet = create<TimesheetState>()((set) => ({
  prompt: null,
  config: null,
  changed: 0,
  setPrompt: (prompt) => set({ prompt }),
  setConfig: (config) => set({ config }),
  bump: () => set((s) => ({ changed: s.changed + 1 })),
  logging: false,
  logFocus: 0,
  openLog: () => set((s) => ({ logging: true, logFocus: s.logFocus + 1 })),
  closeLog: () => set({ logging: false }),
  focusLog: () => set((s) => ({ logFocus: s.logFocus + 1 })),
}))
