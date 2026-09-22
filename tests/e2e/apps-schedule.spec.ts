import { expect, test } from '@playwright/test'
import {
  closeAndWaitForExit,
  createTabViaPalette,
  launchAurora,
  modifierKey,
  startFixtureServer,
} from './helpers'
import type { Page } from 'playwright'

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
