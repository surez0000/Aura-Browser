import { expect, test } from '@playwright/test'
import {
  closeAndWaitForExit,
  createTabViaPalette,
  launchAurora,
  modifierKey,
  startFixtureServer,
} from './helpers'

/**
 * Both sidebar modes sit in the layout, so the page is never covered and
 * nothing depends on where the pointer is. The compact rail shows one favicon
 * per tab; the page simply gets wider.
 */
test('⌘S switches between the full sidebar and the compact rail, and it persists', async () => {
  const server = await startFixtureServer()
  const first = await launchAurora()
  const { chrome } = first
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()

    const sidebar = chrome.getByTestId('sidebar')
    const width = async (): Promise<number> => (await sidebar.boundingBox())?.width ?? 0
    const cardLeft = async (): Promise<number> =>
      (await chrome.getByTestId('page-card').boundingBox())?.x ?? 0

    await expect(sidebar).toHaveAttribute('data-state', 'fixed')
    expect(await width()).toBeGreaterThan(200)
    const fullCardLeft = await cardLeft()

    // Compact: the rail stays on screen and the page grows.
    await chrome.keyboard.press(`${modifierKey()}+s`)
    await expect(sidebar).toHaveAttribute('data-state', 'compact')
    await expect.poll(width, { timeout: 5_000 }).toBeLessThan(80)
    expect(await width()).toBeGreaterThan(40)
    expect(await cardLeft()).toBeLessThan(fullCardLeft)

    // The tab is still listed — as a favicon with its title for assistive tech.
    await expect(chrome.getByTestId('tab-item')).toHaveCount(1)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toHaveCount(1)
    // Nothing is covering the page: no snapshot is in play.
    await expect(chrome.getByTestId('page-card').locator('img')).toHaveCount(0)

    await chrome.keyboard.press(`${modifierKey()}+s`)
    await expect(sidebar).toHaveAttribute('data-state', 'fixed')
    await expect.poll(width, { timeout: 5_000 }).toBeGreaterThan(200)
  } finally {
    await closeAndWaitForExit(first.app)
  }

  const second = await launchAurora(first.userDataDir)
  try {
    await expect(second.chrome.getByTestId('sidebar')).toHaveAttribute('data-state', 'fixed')
  } finally {
    await second.app.close()
    await server.close()
  }
})

test('the compact rail activates tabs and keeps the page live', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    await createTabViaPalette(chrome, `${server.url}/b.html`)
    await expect(chrome.getByTestId('tab-item')).toHaveCount(2)

    await chrome.keyboard.press(`${modifierKey()}+s`)
    await expect(chrome.getByTestId('sidebar')).toHaveAttribute('data-state', 'compact')

    const items = chrome.getByTestId('tab-item')
    await expect(items.nth(1)).toHaveAttribute('data-active', 'true')
    await items.nth(0).click()
    await expect(items.nth(0)).toHaveAttribute('data-active', 'true')
    // Switching tabs from the rail never swaps the page for a snapshot.
    await expect(chrome.getByTestId('page-card').locator('img')).toHaveCount(0)

    // Settings opens over the page, so the live view is swapped for a snapshot
    // while it is up and comes back when it closes. Escape dismisses it: the
    // gear cannot, now that the dialog's scrim covers the whole window.
    await chrome.getByTestId('settings-button').click()
    await expect(chrome.getByTestId('settings-flyout')).toBeVisible()
    await expect(chrome.getByTestId('page-card').locator('img')).toBeVisible()
    await chrome.keyboard.press('Escape')
    await expect(chrome.getByTestId('settings-flyout')).toHaveCount(0)
    await expect(chrome.getByTestId('page-card').locator('img')).toHaveCount(0)
  } finally {
    await app.close()
    await server.close()
  }
})
