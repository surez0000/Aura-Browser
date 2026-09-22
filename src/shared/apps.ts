/**
 * Aura Apps — small pieces of the browser you switch on in the App Store.
 *
 * The catalogue is first-party and ships with Aura: an app runs inside the
 * browser chrome, which is privileged, so unlike a Chrome extension there is no
 * sandbox between it and your tabs. Third-party code belongs in extensions,
 * which already run in the page. This list is what an app *is* to both sides;
 * the main process owns which of them are on (kv "apps").
 */
export type AuraAppId = 'notes' | 'reminders' | 'timesheet'

export interface AuraAppMeta {
  id: AuraAppId
  name: string
  /** One line, shown under the name in the Store. */
  tagline: string
  /** What switching it on actually adds. */
  description: string
  /** False while an app is still being built — listed, but not switchable. */
  available: boolean
}

export const AURA_APPS: readonly AuraAppMeta[] = [
  {
    id: 'notes',
    name: 'Notes',
    tagline: 'Jot something down without leaving the page',
    description:
      'A note takes the page you were on with it, so you can find it later by what you were reading. Notes also turn up in the command palette beside your tabs and history.',
    available: true,
  },
  {
    id: 'reminders',
    name: 'Reminders',
    tagline: 'Be told about something at the time you choose',
    description:
      'Set a time and Aura tells you — in the window if you are here, as a system notification if you are not. Anything that came due while Aura was closed is waiting when you open it, rather than quietly missed.',
    available: true,
  },
  {
    id: 'timesheet',
    name: 'Timesheet',
    tagline: 'Answer one question through the day, read it back at the end',
    description:
      'Aura asks what you are working on, on your own schedule and only inside your working hours. At the end of the day you get every answer, the time each one covered, and a summary you can copy straight into a timesheet.',
    available: true,
  },
] as const

export function appMeta(id: AuraAppId): AuraAppMeta {
  const meta = AURA_APPS.find((a) => a.id === id)
  if (!meta) throw new Error(`unknown Aura App "${id}"`)
  return meta
}

/** Per-app switches, persisted under kv "apps". */
export interface AppState {
  enabled: boolean
  pinned: boolean
}

export const DEFAULT_APP_STATE: AppState = { enabled: false, pinned: true }
