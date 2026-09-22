import { create } from 'zustand'
import { stillRaised, type ReminderEntry } from '@shared/schedule'

/**
 * Reminders as the chrome sees them: the list, mirrored from main, and the
 * ones whose moment has come and have not been dealt with yet — those are the
 * bars above the page. Selectors return stable references only.
 */
export interface RemindersState {
  reminders: ReminderEntry[]
  due: ReminderEntry[]
  setReminders(list: ReminderEntry[]): void
  raise(reminder: ReminderEntry): void
  dismiss(id: number): void
}

export const useReminders = create<RemindersState>()((set) => ({
  reminders: [],
  due: [],
  // The bars are a projection of the list: whatever has been told and not yet
  // dealt with. Deriving them here means a window that opens after the telling
  // — a fresh launch catching up on a reminder that fell due overnight — shows
  // them without a push having to find a listener that exists yet.
  setReminders: (reminders) => set({ reminders, due: stillRaised(reminders, Date.now()) }),
  raise: (reminder) =>
    set((s) => ({
      due: s.due.some((d) => d.id === reminder.id)
        ? s.due.map((d) => (d.id === reminder.id ? reminder : d))
        : [...s.due, reminder],
    })),
  dismiss: (id) => set((s) => ({ due: s.due.filter((d) => d.id !== id) })),
}))
