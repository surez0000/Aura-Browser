import { expect, test } from '@playwright/test'
import {
  closeAndWaitForExit,
  createTabViaPalette,
  launchAurora,
  modifierKey,
  pageFor,
  startFixtureServer,
} from './helpers'
import type { ElectronApplication, Page } from 'playwright'

/** The scheduler ticks every half minute; under test it ticks every 300 ms. */
const FAST = { env: { AURORA_SCHEDULER_TICK_MS: '300' } }

async function enable(chrome: Page, app: 'reminders' | 'timesheet'): Promise<void> {
  await chrome.getByTestId('apps-button').click()
  await expect(chrome.getByTestId('app-store')).toBeVisible()
  await chrome
    .locator(`[data-testid="app-row"][data-app="${app}"] [data-testid="app-toggle"]`)
    .click()
  await chrome.getByTestId('app-store-close').click()
  await expect(chrome.locator(`[data-testid="pinned-app"][data-app="${app}"]`)).toBeVisible()
}

test('a reminder set from a page is raised above the page when its time comes', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora(undefined, FAST)
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()
    await enable(chrome, 'reminders')

    // ⇧⌘E: the composer opens with the page attached.
    await chrome.keyboard.press(`${modifierKey()}+Shift+e`)
    await expect(chrome.getByTestId('reminders-panel')).toBeVisible()
    await expect(chrome.getByTestId('reminder-attach')).toHaveAttribute('data-on', 'true')
    await chrome.getByTestId('reminder-text').fill('Ask about the tiers')
    await chrome.getByTestId('reminder-quick').filter({ hasText: 'Tomorrow morning' }).click()
    await chrome.getByTestId('reminder-add').click()

    // It lands in Tomorrow, with the page on it.
    const row = chrome.getByTestId('reminder-row')
    await expect(row).toHaveCount(1)
    await expect(row).toHaveAttribute('data-bucket', 'tomorrow')
    await expect(row.getByTestId('reminder-page')).toContainText('Fixture A')
    await chrome.getByTestId('reminders-panel-close').click()

    // One whose time has already come is raised at once — as a bar above the
    // page, never a dialog over it.
    await chrome.evaluate(
      `window.aurora.invoke('reminders:create', { text: 'Stand up', dueAt: Date.now() - 1000 })`,
    )
    const bar = chrome.getByTestId('reminder-bar')
    await expect(bar).toBeVisible()
    await expect(bar).toContainText('Stand up')
    await expect(chrome.getByTestId('page-card')).toBeVisible()

    // Later → 10m puts it away and brings it back later; Done finishes it.
    await bar.getByTestId('reminder-bar-snooze').click()
    await bar.getByTestId('reminder-bar-snooze-options').getByText('10m').click()
    await expect(chrome.getByTestId('reminder-bar')).toHaveCount(0)

    await chrome.locator('[data-testid="pinned-app"][data-app="reminders"]').click()
    const snoozed = chrome.getByTestId('reminder-row').filter({ hasText: 'Stand up' })
    await expect(snoozed).toHaveAttribute('data-bucket', 'today')
    await snoozed.getByTestId('reminder-complete').click()
    await expect(snoozed).toHaveAttribute('data-bucket', 'done')
    await expect(chrome.getByTestId('reminders-clear-done')).toBeVisible()
  } finally {
    await app.close()
    await server.close()
  }
})

test('a reminder that fell due while Aura was closed is waiting on the next launch', async () => {
  const first = await launchAurora(undefined, FAST)
  try {
    await enable(first.chrome, 'reminders')
    // Due in a moment — after this instance has gone.
    await first.chrome.evaluate(
      `window.aurora.invoke('reminders:create', { text: 'Renew the domain', dueAt: Date.now() + 1500 })`,
    )
    await first.chrome.locator('[data-testid="pinned-app"][data-app="reminders"]').click()
    await expect(first.chrome.getByTestId('reminder-row')).toHaveCount(1)
    await expect(first.chrome.getByTestId('reminder-bar')).toHaveCount(0)
  } finally {
    await closeAndWaitForExit(first.app)
  }

  await new Promise((r) => setTimeout(r, 1600))
  const second = await launchAurora(first.userDataDir, FAST)
  try {
    // Launch catch-up: it was not quietly missed.
    const bar = second.chrome.getByTestId('reminder-bar')
    await expect(bar).toBeVisible()
    await expect(bar).toContainText('Renew the domain')
    await bar.getByTestId('reminder-bar-done').click()
    await expect(second.chrome.getByTestId('reminder-bar')).toHaveCount(0)
  } finally {
    await second.app.close()
  }
})

test('the timesheet asks its question, takes the answer in place, and reads the day back', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora(undefined, FAST)
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()

    // Off: nothing asks, whatever the hour.
    await expect(chrome.getByTestId('timesheet-bar')).toHaveCount(0)

    // Any hour of any day, so the test does not depend on when it runs.
    await chrome.evaluate(
      `window.aurora.invoke('apps:setTimesheetConfig', { question: 'What are you on?', days: [0,1,2,3,4,5,6], startHour: 0, endHour: 24, intervalMinutes: 30 })`,
    )
    await enable(chrome, 'timesheet')

    // The question arrives above the page, with the page's title suggested.
    const bar = chrome.getByTestId('timesheet-bar')
    await expect(bar).toBeVisible()
    await expect(bar.getByTestId('timesheet-bar-question')).toHaveText('What are you on?')
    await expect(bar.getByTestId('timesheet-bar-input')).toHaveAttribute('placeholder', /Fixture A/)
    await expect(chrome.getByTestId('page-card')).toBeVisible()

    await bar.getByTestId('timesheet-bar-input').fill('Reviewing the spec')
    await bar.getByTestId('timesheet-bar-input').press('Enter')
    await expect(chrome.getByTestId('timesheet-bar')).toHaveCount(0)
    // One question per interval: it does not come straight back.
    await chrome.waitForTimeout(900)
    await expect(chrome.getByTestId('timesheet-bar')).toHaveCount(0)

    // The day view has the answer, timed, and the schedule is right there.
    await chrome.locator('[data-testid="pinned-app"][data-app="timesheet"]').click()
    await expect(chrome.getByTestId('timesheet-panel')).toBeVisible()
    await expect(chrome.getByTestId('timesheet-day')).toHaveText('Today')
    await expect(chrome.getByTestId('timesheet-stats')).toContainText('Answers')
    await expect(chrome.getByTestId('timesheet-totals')).toContainText('Reviewing the spec')
    await expect(chrome.getByTestId('timesheet-entry')).toHaveCount(1)
    await expect(chrome.getByTestId('timesheet-next-question')).toContainText('Next question at')

    // Plain text copies with numbered lists, ready for a mail or chat box.
    await chrome.getByTestId('timesheet-copy-text').click()
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toMatch(
        /^\d{4}-\d{2}-\d{2} — .+\n\n1\. Reviewing the spec — .+\n\nTimeline\n1\. \d{2}:\d{2}–\d{2}:\d{2} {2}Reviewing the spec$/,
      )

    // The whole week copies too: its totals, then each day that had answers.
    await chrome.getByTestId('timesheet-scope-week').click()
    await expect(chrome.getByTestId('timesheet-week-range')).toBeVisible()
    await chrome.getByTestId('timesheet-copy-text').click()
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toMatch(
        /^Week \d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2} — .+\n\nTotals\n1\. Reviewing the spec — .+\n\n(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) \d{4}-\d{2}-\d{2} — .+\n1\. Reviewing the spec — .+$/,
      )
    await chrome.getByTestId('timesheet-copy-csv').click()
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toMatch(/^date,from,to,minutes,doing,page\n\d{4}-\d{2}-\d{2},.*"Reviewing the spec"/)
    await chrome.getByTestId('timesheet-scope-day').click()

    await chrome.getByTestId('timesheet-settings').click()
    await expect(chrome.getByTestId('timesheet-question')).toHaveValue('What are you on?')
    await expect(
      chrome.locator('[data-testid="timesheet-interval"] [data-active="true"]'),
    ).toHaveText('30m')

    // Yesterday was never asked.
    await chrome.getByTestId('timesheet-prev').click()
    await expect(chrome.getByTestId('timesheet-day')).toHaveText('Yesterday')
    await expect(chrome.getByTestId('timesheet-body')).toContainText('Nothing was asked that day')
  } finally {
    await app.close()
    await server.close()
  }
})

/** Click a menu item exactly as its shortcut would (⇧⌘L and friends). */
async function clickMenu(app: ElectronApplication, top: string, label: string): Promise<void> {
  const ok = await app.evaluate(
    ({ Menu, BrowserWindow }, [top, label]) => {
      const item = Menu.getApplicationMenu()
        ?.items.find((i) => i.label === top)
        ?.submenu?.items.find((i) => i.label === label)
      item?.click(undefined, BrowserWindow.getAllWindows().sort((a, b) => a.id - b.id)[0])
      return !!item
    },
    [top, label],
  )
  expect(ok, `${top} > ${label} should exist`).toBe(true)
}

test('unplanned work is logged between questions, from a bar or the day view', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora(undefined, FAST)
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()
    await chrome.evaluate(
      `window.aurora.invoke('apps:setTimesheetConfig', { question: 'What are you on?', days: [0,1,2,3,4,5,6], startHour: 0, endHour: 24, intervalMinutes: 30 })`,
    )

    // Off: the shortcut does nothing.
    await clickMenu(app, 'View', 'Log Work Now…')
    await chrome.waitForTimeout(300)
    await expect(chrome.getByTestId('timesheet-log-bar')).toHaveCount(0)

    await enable(chrome, 'timesheet')
    const question = chrome.getByTestId('timesheet-bar')
    await expect(question).toBeVisible()
    await question.getByTestId('timesheet-bar-input').fill('Reviewing the spec')
    await question.getByTestId('timesheet-bar-input').press('Enter')
    await expect(question).toHaveCount(0)

    // Reading the page, something comes up: ⇧⌘L opens a bar that takes the
    // keyboard from the page, so typing lands in it.
    const page = await pageFor(app, '/a.html', 10_000)
    expect(page, 'the fixture page should be reachable').not.toBeNull()
    await page?.mouse.click(200, 200)
    await clickMenu(app, 'View', 'Log Work Now…')
    const bar = chrome.getByTestId('timesheet-log-bar')
    await expect(bar).toBeVisible()
    await expect(bar.getByTestId('timesheet-log-input')).toBeFocused()
    await expect(bar.getByTestId('timesheet-log-input')).toHaveAttribute('placeholder', /Fixture A/)
    if (process.platform === 'darwin') {
      await expect
        .poll(() =>
          app.evaluate(({ webContents, BrowserWindow }) => {
            const main = BrowserWindow.getAllWindows().sort((a, b) => a.id - b.id)[0]
            return webContents.getFocusedWebContents() === main?.webContents
          }),
        )
        .toBe(true)
    }

    // It began a quarter of an hour ago, before there was a moment to log it.
    await bar.getByTestId('timesheet-log-input').fill('P1 customer bug')
    await bar.getByTestId('timesheet-log-start-15').click()
    await expect(bar.getByTestId('timesheet-log-start-15')).toHaveAttribute('aria-checked', 'true')
    await bar.getByTestId('timesheet-log-submit').click()
    await expect(chrome.getByTestId('timesheet-log-bar')).toHaveCount(0)
    // Logging is not a question: no new one arrives.
    await chrome.waitForTimeout(900)
    await expect(chrome.getByTestId('timesheet-bar')).toHaveCount(0)

    // Escape lets it go without logging anything.
    await clickMenu(app, 'View', 'Log Work Now…')
    await expect(bar).toBeVisible()
    await bar.getByTestId('timesheet-log-input').fill('Not this')
    await bar.getByTestId('timesheet-log-input').press('Escape')
    await expect(chrome.getByTestId('timesheet-log-bar')).toHaveCount(0)

    // The day view: marked as unplanned, first in the day since it began
    // before the question, and timed alongside the answers.
    await chrome.locator('[data-testid="pinned-app"][data-app="timesheet"]').click()
    await expect(chrome.getByTestId('timesheet-panel')).toBeVisible()
    const entries = chrome.getByTestId('timesheet-entry')
    await expect(entries).toHaveCount(2)
    await expect(entries.nth(0)).toContainText('P1 customer bug')
    await expect(entries.nth(0).getByTestId('timesheet-entry-unplanned')).toBeVisible()
    await expect(entries.nth(1).getByTestId('timesheet-entry-unplanned')).toHaveCount(0)
    await expect(chrome.getByTestId('timesheet-totals')).toContainText('P1 customer bug')
    await expect(chrome.getByTestId('timesheet-body')).not.toContainText('Not this')

    // The day view's own line logs another and stays for the next one.
    const line = chrome.getByTestId('timesheet-log')
    await line.getByTestId('timesheet-log-input').fill('Call with Ops')
    await line.getByTestId('timesheet-log-input').press('Enter')
    await expect(line.getByTestId('timesheet-log-submit')).toHaveText('Logged')
    await expect(line.getByTestId('timesheet-log-input')).toHaveValue('')
    await expect(entries).toHaveCount(3)
    await expect(entries.nth(2)).toContainText('Call with Ops')

    // ⇧⌘L with the day view open puts the caret in that line, not a bar.
    await chrome.getByTestId('timesheet-stats').click()
    await expect(line.getByTestId('timesheet-log-input')).not.toBeFocused()
    await clickMenu(app, 'View', 'Log Work Now…')
    await expect(line.getByTestId('timesheet-log-input')).toBeFocused()
    await expect(chrome.getByTestId('timesheet-log-bar')).toHaveCount(0)

    // Only today takes new work.
    await chrome.getByTestId('timesheet-prev').click()
    await expect(chrome.getByTestId('timesheet-log')).toHaveCount(0)
  } finally {
    await app.close()
    await server.close()
  }
})

test('a timesheet question survives a restart, and Skip counts rather than times', async () => {
  const first = await launchAurora(undefined, FAST)
  try {
    await first.chrome.evaluate(
      `window.aurora.invoke('apps:setTimesheetConfig', { days: [0,1,2,3,4,5,6], startHour: 0, endHour: 24 })`,
    )
    await enable(first.chrome, 'timesheet')
    await expect(first.chrome.getByTestId('timesheet-bar')).toBeVisible()
  } finally {
    await closeAndWaitForExit(first.app)
  }

  const second = await launchAurora(first.userDataDir, FAST)
  try {
    // Still waiting for its answer after the restart.
    const bar = second.chrome.getByTestId('timesheet-bar')
    await expect(bar).toBeVisible()
    await bar.getByTestId('timesheet-bar-skip').click()
    await expect(second.chrome.getByTestId('timesheet-bar')).toHaveCount(0)

    await second.chrome.locator('[data-testid="pinned-app"][data-app="timesheet"]').click()
    await expect(second.chrome.getByTestId('timesheet-stats')).toContainText('Skipped')
    await expect(second.chrome.getByTestId('timesheet-entry')).toContainText('Skipped')
  } finally {
    await second.app.close()
  }
})
