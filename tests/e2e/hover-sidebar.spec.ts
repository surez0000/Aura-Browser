import { expect, test } from '@playwright/test'
import { createTabViaPalette, launchAurora, modifierKey, startFixtureServer } from './helpers'

/**
 * Show-on-hover sidebar, keyboard-driven use. A panel revealed by ⌘L has no
 * pointer inside to leave; it must still get out of the way once the address
 * is submitted, and the page under it must not stay a stale snapshot.
 */
test('⌘L reveals the hidden sidebar; submitting a URL hides it and the live page returns', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()

    const sidebar = chrome.getByTestId('sidebar')
    await chrome.mouse.move(900, 400) // pointer over the page, away from the panel
    await chrome.keyboard.press(`${modifierKey()}+s`)
    await expect(sidebar).toHaveAttribute('data-state', 'hidden')

    await chrome.keyboard.press(`${modifierKey()}+l`)
    await expect(sidebar).toHaveAttribute('data-state', 'revealed')
    await expect(chrome.getByTestId('url-input')).toBeFocused()
    await expect(chrome.getByTestId('page-card').locator('img')).toBeVisible()

    await chrome.getByTestId('url-input').fill(`${server.url}/b.html`)
    await chrome.keyboard.press('Enter')

    // The panel lets go, the snapshot is gone, and the tab moved on.
    await expect(sidebar).toHaveAttribute('data-state', 'hidden')
    await expect(chrome.getByTestId('page-card').locator('img')).toHaveCount(0)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture B' })).toHaveCount(1)

    // Escape from ⌘L (no navigation) must not leave the panel stuck either.
    await chrome.keyboard.press(`${modifierKey()}+l`)
    await expect(sidebar).toHaveAttribute('data-state', 'revealed')
    await chrome.keyboard.press('Escape')
    await expect(sidebar).toHaveAttribute('data-state', 'hidden')
  } finally {
    await app.close()
    await server.close()
  }
})

test('switching to hover from Settings keeps the layout until the panel first hides', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    const spacerWidth = async (): Promise<number> =>
      (await chrome.getByTestId('sidebar-spacer').boundingBox())?.width ?? 0
    expect(await spacerWidth()).toBeGreaterThan(200)

    const gear = chrome.getByTestId('settings-button')
    const box = await gear.boundingBox()
    if (!box) throw new Error('settings button not laid out')
    await chrome.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await gear.click()
    await chrome.getByTestId('setting-sidebar-hover').click()

    // Still in the layout, no snapshot: nothing jumps under the pointer.
    await expect(chrome.getByTestId('sidebar')).toHaveAttribute('data-state', 'revealed')
    await chrome.waitForTimeout(400)
    expect(await spacerWidth()).toBeGreaterThan(200)
    await expect(chrome.getByTestId('page-card').locator('img')).toHaveCount(0)

    // Leave: the panel hides and only then does the page take the width.
    await gear.click()
    await chrome.mouse.move(900, 400)
    await expect(chrome.getByTestId('sidebar')).toHaveAttribute('data-state', 'hidden')
    await expect.poll(spacerWidth, { timeout: 5_000 }).toBeLessThan(2)
  } finally {
    await app.close()
    await server.close()
  }
})

test('a page load shows the progress bar and the address spinner', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `${server.url}/slow.html`)
    const bar = chrome.getByTestId('loading-bar')
    await expect(bar).toHaveAttribute('data-phase', 'loading')
    await expect(chrome.getByTestId('url-loading')).toBeVisible()
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Slow Fixture' })).toBeVisible({
      timeout: 10_000,
    })
    await expect(bar).toHaveCount(0)
    await expect(chrome.getByTestId('url-loading')).toHaveCount(0)
  } finally {
    await app.close()
    await server.close()
  }
})
