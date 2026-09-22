import { expect, test } from '@playwright/test'
import {
  closeAndWaitForExit,
  createTabViaPalette,
  launchAurora,
  modifierKey,
  startFixtureServer,
} from './helpers'
import type { Page } from 'playwright'

async function openStore(chrome: Page): Promise<void> {
  await chrome.keyboard.press(`${modifierKey()}+Shift+P`)
  await chrome.getByTestId('palette-input').fill('Aura Apps')
  const row = chrome.getByTestId('palette-result').filter({ hasText: 'Aura Apps' }).first()
  await row.waitFor()
  await row.click()
  await expect(chrome.getByTestId('app-store')).toBeVisible()
}

test('an app is off until the Store switches it on, and then it is pinned', async () => {
  const { app, chrome } = await launchAurora()
  try {
    // Nothing is pinned to begin with: someone who wants no apps sees none.
    await expect(chrome.getByTestId('pinned-app')).toHaveCount(0)

    await openStore(chrome)
    const notes = chrome.locator('[data-testid="app-row"][data-app="notes"]')
    await expect(notes).toHaveCount(1)
    await expect(notes).not.toHaveAttribute('data-enabled', 'true')
    // Apps still being built are listed, but cannot be switched on.
    await expect(
      chrome.locator('[data-testid="app-row-upcoming"][data-app="timesheet"]'),
    ).toBeVisible()

    await notes.getByTestId('app-toggle').click()
    await expect(notes).toHaveAttribute('data-enabled', 'true')

    await chrome.getByTestId('app-store-close').click()
    await expect(chrome.locator('[data-testid="pinned-app"][data-app="notes"]')).toBeVisible()

    // Unpinning leaves it switched on, it just stops taking rail space.
    await openStore(chrome)
    await notes.getByTestId('app-pin').click()
    await chrome.getByTestId('app-store-close').click()
    await expect(chrome.getByTestId('pinned-app')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('a note keeps the page it was taken on, survives a restart, and is findable in the palette', async () => {
  const server = await startFixtureServer()
  const first = await launchAurora()
  const { chrome } = first
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()

    await openStore(chrome)
    await chrome
      .locator('[data-testid="app-row"][data-app="notes"] [data-testid="app-toggle"]')
      .click()
    await chrome.getByTestId('app-store-close').click()

    // ⌘E writes a note about whatever is on screen and opens it, focused.
    await chrome.keyboard.press(`${modifierKey()}+e`)
    await expect(chrome.getByTestId('notes-panel')).toBeVisible()
    await expect(chrome.getByTestId('note-editor')).toBeFocused()
    await chrome.getByTestId('note-editor').fill('Ask about the pricing tiers\nthey moved')

    // The note carries the page, which is how it is found again later.
    await expect(chrome.getByTestId('note-open-page')).toContainText('Fixture A')
    await expect(chrome.getByTestId('note-title').first()).toHaveText(
      'Ask about the pricing tiers',
      { timeout: 5_000 },
    )
    await chrome.getByTestId('notes-panel-close').click()
  } finally {
    await closeAndWaitForExit(first.app)
  }

  const second = await launchAurora(first.userDataDir)
  try {
    // The app is still on, and the note is still there.
    await expect(
      second.chrome.locator('[data-testid="pinned-app"][data-app="notes"]'),
    ).toBeVisible()

    // Found by a word from the body, not just the first line.
    await second.chrome.keyboard.press(`${modifierKey()}+t`)
    await second.chrome.getByTestId('palette-input').fill('moved')
    const noteRow = second.chrome
      .locator('[data-testid="palette-result"][data-type="note"]')
      .first()
    await expect(noteRow).toContainText('Ask about the pricing tiers')
    await noteRow.click()

    // Choosing it opens Notes on that note.
    await expect(second.chrome.getByTestId('notes-panel')).toBeVisible()
    await expect(second.chrome.getByTestId('note-editor')).toHaveValue(/pricing tiers/)
  } finally {
    await second.app.close()
    await server.close()
  }
})
