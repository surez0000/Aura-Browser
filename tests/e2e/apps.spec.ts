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
  await chrome.getByTestId('apps-button').click()
  await expect(chrome.getByTestId('app-store')).toBeVisible()
}

test('an app is off until the Store switches it on, and then it is pinned', async () => {
  const { app, chrome } = await launchAurora()
  try {
    // Nothing is pinned to begin with: someone who wants no apps sees none.
    await expect(chrome.getByTestId('pinned-app')).toHaveCount(0)
    // But the way in is on screen regardless — it used to live only in a menu,
    // so nothing suggested apps existed until you already knew.
    await expect(chrome.getByTestId('apps-button')).toBeVisible()

    await openStore(chrome)
    const notes = chrome.locator('[data-testid="app-row"][data-app="notes"]')
    await expect(notes).toHaveCount(1)
    await expect(notes).not.toHaveAttribute('data-enabled', 'true')
    // All three apps are real now: each is a switch, none is "coming next".
    await expect(chrome.getByTestId('app-row')).toHaveCount(3)
    await expect(chrome.getByTestId('app-row-upcoming')).toHaveCount(0)

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

test('a sticky keeps the page it was written on, survives a restart, and is findable', async () => {
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

    // ⌘E opens a sticky to write on. Nothing is stored yet.
    await chrome.keyboard.press(`${modifierKey()}+e`)
    await expect(chrome.getByTestId('note-editor-card')).toBeVisible()
    await expect(chrome.getByTestId('note-title-input')).toBeFocused()
    await expect(chrome.getByTestId('note-item')).toHaveCount(0)

    await chrome.getByTestId('note-title-input').fill('Ask about the pricing tiers')
    await chrome.getByTestId('note-editor').fill('they moved the middle plan')
    // Colour is how a sticky is found before it is read.
    await chrome.locator('[data-testid="note-color"][data-color="amber"]').click()
    await expect(chrome.getByTestId('note-saved')).toBeVisible()

    // It carries the page it was written on.
    await expect(chrome.getByTestId('note-open-page')).toContainText('Fixture A')
    // Escape puts the sticky down; the board keeps it.
    await chrome.keyboard.press('Escape')
    await expect(chrome.getByTestId('note-editor-card')).toHaveCount(0)
    const card = chrome.getByTestId('note-item')
    await expect(card).toHaveCount(1)
    await expect(card).toHaveAttribute('data-color', 'amber')

    // Pinning keeps it at the top of the board.
    await card.getByTestId('note-pin').click()
    await expect(card).toHaveAttribute('data-pinned', 'true')
    await chrome.getByTestId('notes-panel-close').click()
  } finally {
    await closeAndWaitForExit(first.app)
  }

  const second = await launchAurora(first.userDataDir)
  try {
    await expect(
      second.chrome.locator('[data-testid="pinned-app"][data-app="notes"]'),
    ).toBeVisible()

    // Found by a word from the body, not just the title.
    await second.chrome.keyboard.press(`${modifierKey()}+t`)
    await second.chrome.getByTestId('palette-input').fill('moved')
    const noteRow = second.chrome
      .locator('[data-testid="palette-result"][data-type="note"]')
      .first()
    await expect(noteRow).toContainText('Ask about the pricing tiers')
    await noteRow.click()

    // Choosing it opens that sticky, colour and all.
    await expect(second.chrome.getByTestId('note-editor-card')).toBeVisible()
    await expect(second.chrome.getByTestId('note-editor')).toHaveValue(/moved/)
  } finally {
    await second.app.close()
    await server.close()
  }
})

test('pressing ⌘E and changing your mind leaves nothing behind', async () => {
  const { app, chrome } = await launchAurora()
  try {
    await openStore(chrome)
    await chrome
      .locator('[data-testid="app-row"][data-app="notes"] [data-testid="app-toggle"]')
      .click()
    await chrome.getByTestId('app-store-close').click()

    await chrome.keyboard.press(`${modifierKey()}+e`)
    await expect(chrome.getByTestId('note-editor-card')).toBeVisible()
    await chrome.keyboard.press('Escape')

    // No husk: earlier builds wrote the note the moment the shortcut was hit.
    await expect(chrome.getByTestId('note-item')).toHaveCount(0)
    await expect(chrome.getByTestId('notes-board')).toContainText('The board is empty')
  } finally {
    await app.close()
  }
})
