import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TIMESHEET,
  bucketOf,
  dayToCsv,
  dayToMarkdown,
  dayToText,
  dueNow,
  formatDuration,
  nextOccurrence,
  nextPromptAt,
  quickTimes,
  startOfWeek,
  stillRaised,
  summariseDay,
  summariseWeek,
  weekBounds,
  weekToCsv,
  weekToMarkdown,
  weekToText,
  withinWorkingHours,
  type ReminderEntry,
  type TimesheetEntry,
} from '@shared/schedule'

/** A local moment: Wednesday 2026-09-23 at hh:mm. */
function wed(h: number, m = 0): number {
  return new Date(2026, 8, 23, h, m, 0, 0).getTime()
}
/** Saturday 2026-09-26. */
function sat(h: number): number {
  return new Date(2026, 8, 26, h, 0, 0, 0).getTime()
}

const MINUTE = 60_000

describe('working hours', () => {
  it('is inside on a working day between the hours, exclusive at the end', () => {
    expect(withinWorkingHours(wed(9), DEFAULT_TIMESHEET)).toBe(true)
    expect(withinWorkingHours(wed(17, 59), DEFAULT_TIMESHEET)).toBe(true)
    expect(withinWorkingHours(wed(18), DEFAULT_TIMESHEET)).toBe(false)
    expect(withinWorkingHours(wed(8, 59), DEFAULT_TIMESHEET)).toBe(false)
  })

  it('is never inside on a day that is not a working day', () => {
    expect(withinWorkingHours(sat(12), DEFAULT_TIMESHEET)).toBe(false)
  })
})

describe('next prompt', () => {
  it('asks straight away the first time, if the window is open', () => {
    expect(nextPromptAt(wed(10), null, DEFAULT_TIMESHEET)).toBe(wed(10))
  })

  it('waits for the window to open the first time, if it is not', () => {
    expect(nextPromptAt(wed(7), null, DEFAULT_TIMESHEET)).toBe(wed(9))
  })

  it('waits out the interval after the last question', () => {
    expect(nextPromptAt(wed(10, 10), wed(10), DEFAULT_TIMESHEET)).toBe(wed(10, 30))
  })

  it('rolls an interval that ends after hours over to the next morning', () => {
    expect(nextPromptAt(wed(17, 50), wed(17, 45), DEFAULT_TIMESHEET)).toBe(
      new Date(2026, 8, 24, 9, 0, 0, 0).getTime(),
    )
  })

  it('skips the weekend', () => {
    // Friday evening → Monday morning.
    const fri = new Date(2026, 8, 25, 17, 50).getTime()
    expect(nextPromptAt(fri, fri - 5 * MINUTE, DEFAULT_TIMESHEET)).toBe(
      new Date(2026, 8, 28, 9, 0, 0, 0).getTime(),
    )
  })

  it('has nothing to say when no day is a working day', () => {
    expect(nextPromptAt(wed(10), null, { ...DEFAULT_TIMESHEET, days: [] })).toBeNull()
  })
})

describe('day summary', () => {
  const entry = (
    id: number,
    askedAt: number,
    answer: string | null,
    skipped = false,
    unplanned = false,
  ): TimesheetEntry => ({
    id,
    askedAt,
    answeredAt: answer ? askedAt + MINUTE : null,
    answer,
    tabTitle: null,
    tabUrl: id === 1 ? 'https://example.com/spec' : null,
    skipped,
    unplanned,
  })

  it('attributes each answer the time until the next question', () => {
    const s = summariseDay(
      [
        entry(1, wed(9), 'Spec review'),
        entry(2, wed(9, 30), 'Spec review'),
        entry(3, wed(10), 'Standup'),
      ],
      wed(12),
      wed(10, 20),
      DEFAULT_TIMESHEET,
    )
    expect(s.blocks.map((b) => b.duration / MINUTE)).toEqual([30, 30, 20])
    expect(s.totals[0]).toEqual({ answer: 'Spec review', duration: 60 * MINUTE, count: 2 })
    expect(s.totals[1]).toEqual({ answer: 'Standup', duration: 20 * MINUTE, count: 1 })
    expect(s.totalDuration).toBe(80 * MINUTE)
  })

  it('unplanned work splits the answer it interrupts and runs until the next question', () => {
    // Asked at 10:00, a P1 came up at 10:12, asked again on schedule at 10:30.
    const s = summariseDay(
      [
        entry(1, wed(10), 'Spec review'),
        entry(2, wed(10, 12), 'P1 customer bug', false, true),
        entry(3, wed(10, 30), 'Standup'),
      ],
      wed(12),
      wed(10, 45),
      DEFAULT_TIMESHEET,
    )
    expect(s.blocks.map((b) => [b.answer, b.duration / MINUTE])).toEqual([
      ['Spec review', 12],
      ['P1 customer bug', 18],
      ['Standup', 15],
    ])
    expect(s.totalDuration).toBe(45 * MINUTE)
  })

  it('unplanned work logged after the last question runs to now', () => {
    const s = summariseDay(
      [entry(1, wed(10), 'Spec review'), entry(2, wed(10, 5), 'Call with Ops', false, true)],
      wed(12),
      wed(10, 20),
      DEFAULT_TIMESHEET,
    )
    expect(s.blocks.map((b) => b.duration / MINUTE)).toEqual([5, 15])
  })

  it('never lets one answer run past the interval when the next question was late', () => {
    // A two-hour gap — the machine was asleep. The first answer covers one interval, not two hours.
    const s = summariseDay(
      [entry(1, wed(9), 'Design'), entry(2, wed(11), 'Design')],
      wed(12),
      wed(12),
      DEFAULT_TIMESHEET,
    )
    expect(s.blocks[0]?.duration).toBe(30 * MINUTE)
  })

  it('groups answers regardless of case and spacing', () => {
    const s = summariseDay(
      [entry(1, wed(9), 'Email'), entry(2, wed(9, 30), ' email ')],
      wed(12),
      wed(10),
      DEFAULT_TIMESHEET,
    )
    expect(s.totals).toHaveLength(1)
    expect(s.totals[0]?.count).toBe(2)
  })

  it('counts skipped and unanswered prompts rather than timing them', () => {
    const s = summariseDay(
      [entry(1, wed(9), 'Work'), entry(2, wed(9, 30), null, true), entry(3, wed(10), null)],
      wed(12),
      wed(10, 5),
      DEFAULT_TIMESHEET,
    )
    expect(s.blocks).toHaveLength(1)
    expect(s.skipped).toBe(1)
    expect(s.unanswered).toBe(1)
  })

  it('only looks at the day asked for', () => {
    const s = summariseDay(
      [entry(1, wed(9), 'Today'), entry(2, wed(9) - 86_400_000, 'Yesterday')],
      wed(12),
      wed(12),
      DEFAULT_TIMESHEET,
    )
    expect(s.blocks.map((b) => b.answer)).toEqual(['Today'])
  })

  it('exports Markdown and CSV', () => {
    const s = summariseDay(
      [entry(1, wed(9), 'Spec "review"')],
      wed(12),
      wed(9, 30),
      DEFAULT_TIMESHEET,
    )
    const md = dayToMarkdown(s)
    expect(md).toContain('## 2026-09-23 — 30m')
    expect(md).toContain('| 09:00 | 09:30 | Spec "review" |')
    const csv = dayToCsv(s)
    expect(csv.split('\n')[0]).toBe('date,from,to,minutes,doing,page')
    expect(csv).toContain('2026-09-23,09:00,09:30,30,"Spec ""review""","https://example.com/spec"')
  })

  it('exports plain text with numbered lists', () => {
    const s = summariseDay(
      [
        entry(1, wed(9), 'Spec review'),
        entry(2, wed(10), 'Standup'),
        entry(3, wed(10, 30), 'Spec review'),
      ],
      wed(12),
      wed(11),
      DEFAULT_TIMESHEET,
    )
    expect(dayToText(s).split('\n')).toEqual([
      '2026-09-23 — 1h 30m',
      '',
      '1. Spec review — 1h',
      '2. Standup — 30m',
      '',
      'Timeline',
      '1. 09:00–09:30  Spec review',
      '2. 10:00–10:30  Standup',
      '3. 10:30–11:00  Spec review',
    ])
  })

  it('formats durations the way people say them', () => {
    expect(formatDuration(25 * MINUTE)).toBe('25m')
    expect(formatDuration(60 * MINUTE)).toBe('1h')
    expect(formatDuration(95 * MINUTE)).toBe('1h 35m')
  })
})

describe('week summary', () => {
  /** A local moment in the week of Monday 2026-09-21 (offset 0 = Monday). */
  const at = (offset: number, h: number, m = 0): number =>
    new Date(2026, 8, 21 + offset, h, m, 0, 0).getTime()
  const entry = (id: number, askedAt: number, answer: string): TimesheetEntry => ({
    id,
    askedAt,
    answeredAt: askedAt + MINUTE,
    answer,
    tabTitle: null,
    tabUrl: null,
    skipped: false,
    unplanned: false,
  })
  const entries = [
    entry(1, at(0, 9), 'Spec review'),
    entry(2, at(0, 9, 30), 'Standup'),
    entry(3, at(2, 14), 'spec review'),
    entry(4, at(6, 10), 'Weekend fix'),
    // The next Monday belongs to the next week.
    entry(5, at(7, 9), 'Next week'),
  ]
  const now = at(9, 12)

  it('runs Monday to Sunday, whatever day it is asked about', () => {
    expect(startOfWeek(at(2, 15))).toBe(at(0, 0))
    expect(startOfWeek(at(6, 23))).toBe(at(0, 0))
    expect(startOfWeek(at(0, 0))).toBe(at(0, 0))
    expect(weekBounds(at(3, 12))).toEqual({ from: at(0, 0), to: at(7, 0) })
  })

  it('keeps only the days with answers, and adds the week up across them', () => {
    const w = summariseWeek(entries, at(2, 12), now, DEFAULT_TIMESHEET)
    expect(w.from).toBe('2026-09-21')
    expect(w.to).toBe('2026-09-27')
    expect(w.days.map((d) => `${d.weekday} ${d.date}`)).toEqual([
      'Monday 2026-09-21',
      'Wednesday 2026-09-23',
      'Sunday 2026-09-27',
    ])
    // Case and spacing do not split an activity across days either.
    expect(w.totals[0]).toEqual({ answer: 'Spec review', duration: 60 * MINUTE, count: 2 })
    expect(w.totals.map((t) => t.answer)).not.toContain('Next week')
    expect(w.totalDuration).toBe(w.days.reduce((sum, d) => sum + d.totalDuration, 0))
  })

  it('copies as numbered plain text: the week, then each day', () => {
    const lines = weekToText(summariseWeek(entries, at(0, 9), now, DEFAULT_TIMESHEET)).split('\n')
    expect(lines[0]).toBe('Week 2026-09-21 to 2026-09-27 — 2h')
    expect(lines.slice(1, 6)).toEqual([
      '',
      'Totals',
      '1. Spec review — 1h',
      '2. Standup — 30m',
      '3. Weekend fix — 30m',
    ])
    expect(lines).toContain('Monday 2026-09-21 — 1h')
    expect(lines).toContain('Sunday 2026-09-27 — 30m')
  })

  it('copies as Markdown with a section per day', () => {
    const md = weekToMarkdown(summariseWeek(entries, at(0, 9), now, DEFAULT_TIMESHEET))
    expect(md.startsWith('## Week 2026-09-21 to 2026-09-27')).toBe(true)
    expect(md).toContain('### Wednesday 2026-09-23 — 30m')
    expect(md).toContain('- **Spec review** — 1h')
  })

  it('copies as CSV with every block of every day under one header', () => {
    const csv = weekToCsv(summariseWeek(entries, at(0, 9), now, DEFAULT_TIMESHEET)).split('\n')
    expect(csv[0]).toBe('date,from,to,minutes,doing,page')
    expect(csv).toHaveLength(1 + 4)
    expect(csv.filter((l) => l.startsWith('date'))).toHaveLength(1)
    expect(csv[4]).toContain('2026-09-27')
  })

  it('says so plainly for an empty week', () => {
    const w = summariseWeek([], at(0, 9), now, DEFAULT_TIMESHEET)
    expect(w.days).toEqual([])
    expect(weekToText(w)).toBe('Week 2026-09-21 to 2026-09-27 — 0m')
  })
})

describe('reminders', () => {
  const reminder = (over: Partial<ReminderEntry>): ReminderEntry => ({
    id: 1,
    text: 'Call back',
    dueAt: wed(10),
    repeat: 'none',
    doneAt: null,
    snoozedUntil: null,
    notifiedAt: null,
    url: null,
    pageTitle: null,
    createdAt: wed(8),
    ...over,
  })

  it('is due once its time has come, and only until it has been told', () => {
    expect(dueNow([reminder({})], wed(9, 59))).toHaveLength(0)
    expect(dueNow([reminder({})], wed(10))).toHaveLength(1)
    expect(dueNow([reminder({ notifiedAt: wed(10) })], wed(10, 5))).toHaveLength(0)
  })

  it('comes back after a snooze, and is told again', () => {
    const r = reminder({ notifiedAt: wed(10), snoozedUntil: wed(10, 10) })
    expect(dueNow([r], wed(10, 5))).toHaveLength(0)
    expect(dueNow([r], wed(10, 10))).toHaveLength(1)
  })

  it('never fires once done', () => {
    expect(dueNow([reminder({ doneAt: wed(10, 1) })], wed(11))).toHaveLength(0)
  })

  it('repeats daily, weekly, and over weekdays only', () => {
    expect(nextOccurrence(wed(10), 'none')).toBeNull()
    expect(nextOccurrence(wed(10), 'daily')).toBe(new Date(2026, 8, 24, 10).getTime())
    expect(nextOccurrence(wed(10), 'weekly')).toBe(new Date(2026, 8, 30, 10).getTime())
    // Friday → Monday.
    const fri = new Date(2026, 8, 25, 10).getTime()
    expect(nextOccurrence(fri, 'weekdays')).toBe(new Date(2026, 8, 28, 10).getTime())
  })

  it('sorts into overdue, today, tomorrow, later and done', () => {
    const now = wed(12)
    expect(bucketOf(reminder({ dueAt: wed(10) }), now)).toBe('overdue')
    expect(bucketOf(reminder({ dueAt: wed(15) }), now)).toBe('today')
    expect(bucketOf(reminder({ dueAt: wed(15) + 86_400_000 }), now)).toBe('tomorrow')
    expect(bucketOf(reminder({ dueAt: wed(15) + 3 * 86_400_000 }), now)).toBe('later')
    expect(bucketOf(reminder({ doneAt: wed(11) }), now)).toBe('done')
    // A snooze moves it out of overdue.
    expect(bucketOf(reminder({ dueAt: wed(10), snoozedUntil: wed(14) }), now)).toBe('today')
  })

  it('stays raised once told, until it is done or put off', () => {
    const told = reminder({ notifiedAt: wed(10) })
    expect(stillRaised([told], wed(10, 5))).toHaveLength(1)
    // A window opening later still sees it.
    expect(stillRaised([told], wed(14))).toHaveLength(1)
    expect(stillRaised([reminder({})], wed(10, 5))).toHaveLength(0)
    expect(
      stillRaised([reminder({ notifiedAt: wed(10), doneAt: wed(10, 1) })], wed(11)),
    ).toHaveLength(0)
    expect(
      stillRaised([reminder({ notifiedAt: wed(10), snoozedUntil: wed(11) })], wed(10, 30)),
    ).toHaveLength(0)
    // …and comes back, told again, when the snooze runs out.
    expect(
      stillRaised([reminder({ notifiedAt: wed(11), snoozedUntil: wed(11) })], wed(11, 1)),
    ).toHaveLength(1)
  })

  it('offers quick times that are still ahead', () => {
    const labels = quickTimes(wed(19)).map((q) => q.label)
    // Seven in the evening: "this evening" (18:00) has passed.
    expect(labels).toEqual(['In an hour', 'Tomorrow morning', 'Next week'])
    expect(quickTimes(wed(10)).map((q) => q.label)).toContain('This evening')
  })
})
