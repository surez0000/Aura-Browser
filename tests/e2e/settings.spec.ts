import { expect, test } from '@playwright/test'
import {
  closeAndWaitForExit,
  createTabViaPalette,
  launchAurora,
  modifierKey,
  startFixtureServer,
} from './helpers'

test('settings panel changes the search engine; the palette follows and it persists', async () => {
  const first = await launchAurora()
  const { chrome } = first
  try {
    // ⌘, opens the panel; the gear closes it.
    await chrome.keyboard.press(`${modifierKey()}+,`)
    await expect(chrome.getByTestId('settings-flyout')).toBeVisible()
    await expect(chrome.getByTestId('app-version')).toContainText('Aurora 0.')
    await expect(chrome.getByTestId('updates-status')).toContainText('installed builds')

    await chrome.getByTestId('setting-search-engine').selectOption('google')
    await chrome.getByTestId('settings-button').click()
    await expect(chrome.getByTestId('settings-flyout')).toHaveCount(0)

    await chrome.getByTestId('new-tab-button').click()
    await chrome.getByTestId('palette-input').fill('aurora borealis')
    await expect(
      chrome.getByTestId('palette-result').filter({ hasText: 'Search Google for' }),
    ).toBeVisible()
    await expect(chrome.getByTestId('palette')).toContainText('Searches Google')
    await chrome.keyboard.press('Escape')
  } finally {
    await closeAndWaitForExit(first.app)
  }

  const second = await launchAurora(first.userDataDir)
  try {
    await second.chrome.getByTestId('settings-button').click()
    await expect(second.chrome.getByTestId('setting-search-engine')).toHaveValue('google')
  } finally {
    await second.app.close()
  }
})

test('show-on-hover sidebar hides, reveals from the left edge over a snapshot, and persists', async () => {
  const server = await startFixtureServer()
  const first = await launchAurora()
  const { chrome } = first
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()

    const sidebar = chrome.getByTestId('sidebar')
    const settingsButton = chrome.getByTestId('settings-button')
    const box = await settingsButton.boundingBox()
    if (!box) throw new Error('settings button not laid out')
    // Put the pointer on the gear before clicking so the panel counts as hovered.
    await chrome.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await settingsButton.click()
    await chrome.getByTestId('setting-sidebar-hover').click()

    // The panel stays while the settings popover is open under the pointer…
    await expect(sidebar).toHaveAttribute('data-state', 'revealed')
    // …and the page underneath is a snapshot now (the native view is detached).
    await expect(chrome.getByTestId('page-card').locator('img')).toBeVisible()

    // Close the popover and move away: the panel hides, the view returns.
    await settingsButton.click()
    await chrome.mouse.move(900, 400)
    await expect(sidebar).toHaveAttribute('data-state', 'hidden')
    await expect(chrome.getByTestId('page-card').locator('img')).toHaveCount(0)

    // Touch the left edge: the panel reveals over a fresh snapshot.
    await chrome.mouse.move(2, 400)
    await expect(sidebar).toHaveAttribute('data-state', 'revealed')
    await expect(chrome.getByTestId('page-card').locator('img')).toBeVisible()

    // Leave: it hides again.
    await chrome.mouse.move(900, 400)
    await expect(sidebar).toHaveAttribute('data-state', 'hidden')
  } finally {
    await closeAndWaitForExit(first.app)
  }

  const second = await launchAurora(first.userDataDir)
  try {
    await expect(second.chrome.getByTestId('sidebar')).toHaveAttribute('data-state', 'hidden')
    await expect(second.chrome.getByTestId('top-strip')).toBeVisible()
  } finally {
    await second.app.close()
    await server.close()
  }
})
