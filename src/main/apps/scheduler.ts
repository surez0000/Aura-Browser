import { Notification, powerMonitor } from 'electron'
import { dueNow, nextPromptAt, type ReminderEntry, type TimesheetEntry } from '@shared/schedule'
import type { AppRegistry } from './registry'
import type { RemindersStore } from '../services/db/reminders'
import type { TimesheetStore } from '../services/db/timesheet'

const DEFAULT_TICK_MS = 30_000

export interface TimesheetPrompt {
  entry: TimesheetEntry
  question: string
  lastAnswer: string | null
}

interface Deps {
  apps: AppRegistry
  reminders: RemindersStore
  timesheet: TimesheetStore
  /** The page on screen, for the timesheet's suggestion. */
  activeTab: () => { title: string | null; url: string | null }
  /** Whether the person is looking at Aura right now. */
  isFocused: () => boolean
  /** Bring the window forward — what a clicked notification does. */
  focusWindow: () => void
  reminderDue: (reminder: ReminderEntry) => void
  /** The list changed under the scheduler's hand (a reminder was told). */
  remindersChanged: () => void
  timesheetPrompt: (prompt: TimesheetPrompt) => void
  /** The tick, overridable so tests need not wait half a minute. */
  tickMs?: number
}

/**
 * One clock for every app. It ticks on a slow interval, and again the moment
 * the machine wakes, because a laptop that slept through a reminder should say
 * so on opening rather than half a minute later. Nothing runs for an app that
 * is switched off.
 *
 * Telling you is two-sided: a push to the chrome, which shows a bar above the
 * page, and — only when Aura is not the window you are looking at — a system
 * notification, so the reminder reaches you in whatever app you are in.
 */
export class AppScheduler {
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly deps: Deps) {}

  start(): void {
    const ms = this.deps.tickMs ?? DEFAULT_TICK_MS
    this.timer = setInterval(() => this.tick(), ms)
    // Coming back from sleep: whatever fell due meanwhile is raised at once.
    powerMonitor.on('resume', () => this.tick())
    // Launch catch-up: anything that came due while Aura was closed.
    this.tick()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  tick(now = Date.now()): void {
    if (this.deps.apps.isEnabled('reminders')) this.tickReminders(now)
    if (this.deps.apps.isEnabled('timesheet')) this.tickTimesheet(now)
  }

  private tickReminders(now: number): void {
    const { reminders } = this.deps
    const due = dueNow(reminders.open(), now)
    if (due.length === 0) return
    for (const r of due) {
      reminders.markNotified(r.id, now)
      const fresh = reminders.get(r.id) ?? r
      this.deps.reminderDue(fresh)
      if (!this.deps.isFocused()) {
        this.notify(r.text, r.pageTitle ? `About: ${r.pageTitle}` : 'Reminder', () =>
          this.deps.reminderDue(fresh),
        )
      }
    }
    // The chrome derives its bars from the list, so it must see the telling.
    this.deps.remindersChanged()
  }

  private tickTimesheet(now: number): void {
    const { timesheet, apps } = this.deps
    const cfg = apps.timesheetConfig()
    const pending = timesheet.pending()
    if (pending) {
      // Ignored for a whole interval: it counts as skipped, and a fresh
      // question replaces it, so the day stays honest.
      if (now - pending.askedAt < cfg.intervalMinutes * 60_000) return
      timesheet.skip(pending.id, now)
    }
    const due = nextPromptAt(now, timesheet.lastAskedAt(), cfg)
    if (due === null || due > now) return

    const tab = this.deps.activeTab()
    const entry = timesheet.ask(now, tab)
    const prompt: TimesheetPrompt = {
      entry,
      question: cfg.question,
      lastAnswer: timesheet.lastAnswer(),
    }
    this.deps.timesheetPrompt(prompt)
    if (!this.deps.isFocused()) {
      this.notify(cfg.question, 'Answer in Aura — one line is enough.', () =>
        this.deps.timesheetPrompt(prompt),
      )
    }
  }

  private notify(title: string, body: string, onClick: () => void): void {
    // The harness's windows are rarely focused; a test run must not fill the
    // developer's notification centre.
    if (process.env.AURORA_E2E === '1') return
    if (!Notification.isSupported()) return
    const n = new Notification({ title, body })
    n.on('click', () => {
      this.deps.focusWindow()
      onClick()
    })
    n.show()
  }
}
