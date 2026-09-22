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
 */
export interface TimesheetState {
  prompt: TimesheetPrompt | null
  config: TimesheetConfig | null
  changed: number
  setPrompt(prompt: TimesheetPrompt | null): void
  setConfig(config: TimesheetConfig): void
  bump(): void
}

export const useTimesheet = create<TimesheetState>()((set) => ({
  prompt: null,
  config: null,
  changed: 0,
  setPrompt: (prompt) => set({ prompt }),
  setConfig: (config) => set({ config }),
  bump: () => set((s) => ({ changed: s.changed + 1 })),
}))
