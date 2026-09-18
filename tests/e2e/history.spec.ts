import { expect, test } from '@playwright/test'
import { createTabViaPalette, launchAurora, modifierKey, startFixtureServer } from './helpers'

/**
 * The history manager (⌘Y): what was visited, searchable, with per-visit
 * delete, "forget this site", and clear-by-range.
 */
test('history lists visits, searches, deletes one, and clears everything', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()
    await createTabViaPalette(chrome, `${server.url}/b.html`)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture B' })).toBeVisible()

    await chrome.keyboard.press(`${modifierKey()}+y`)
    const panel = chrome.getByTestId('history-panel')
    await expect(panel).toBeVisible()
    await expect(chrome.getByTestId('history-search')).toBeFocused()

    const entries = chrome.getByTestId('history-entry')
    await expect(entries).toHaveCount(2)
    await expect(chrome.getByTestId('history-day').first()).toHaveText('Today')
    await expect(chrome.getByTestId('history-title').first()).toHaveText('Fixture B')

    // Search narrows to one.
    await chrome.getByTestId('history-search').fill('Fixture A')
    await expect(entries).toHaveCount(1)
    await expect(chrome.getByTestId('history-title')).toHaveText('Fixture A')

    // Deleting that visit leaves the list empty for this search…
    await entries.first().hover()
    await chrome.getByTestId('history-remove').first().click()
    await expect(entries).toHaveCount(0)
    // …and it is really gone, not just filtered out.
    await chrome.getByTestId('history-search').fill('')
    await expect(entries).toHaveCount(1)
    await expect(chrome.getByTestId('history-title')).toHaveText('Fixture B')

    // Clear everything.
    await chrome.getByTestId('history-clear-open').click()
    await chrome.getByTestId('history-clear-all').click()
    await expect(entries).toHaveCount(0)
    await expect(chrome.getByTestId('history-list')).toContainText('No history yet')

    await chrome.getByTestId('history-close').click()
    await expect(panel).toHaveCount(0)
    // The live page is back — the snapshot was released.
    await expect(chrome.getByTestId('page-card').locator('img')).toHaveCount(0)
  } finally {
    await app.close()
    await server.close()
  }
})

test('opening an entry from history navigates to it', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()
    const item = chrome.getByTestId('tab-item').first()
    await item.hover()
    await item.getByTestId('tab-close').click()
    await expect(chrome.getByTestId('tab-item')).toHaveCount(0)

    await chrome.keyboard.press(`${modifierKey()}+y`)
    await chrome.getByTestId('history-entry').first().click()
    await expect(chrome.getByTestId('history-panel')).toHaveCount(0)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()
  } finally {
    await app.close()
    await server.close()
  }
})
