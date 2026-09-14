import { expect, test } from '@playwright/test'
import { createTabViaPalette, launchAurora, modifierKey, startFixtureServer } from './helpers'

test('boots to the empty state with sidebar chrome', async () => {
  const { app, chrome } = await launchAurora()
  try {
    await expect(chrome.getByTestId('sidebar')).toBeVisible()
    await expect(chrome.getByTestId('empty-state')).toBeVisible()
    await expect(chrome.getByTestId('url-pill')).toContainText('New Tab')
    await expect(chrome.getByTestId('new-tab-button')).toBeVisible()
  } finally {
    await app.close()
  }
})

test('⌘S switches the sidebar between fixed and show-on-hover', async () => {
  const { app, chrome } = await launchAurora()
  try {
    const sidebar = chrome.getByTestId('sidebar')
    const rightEdge = async (): Promise<number> => {
      const box = await sidebar.boundingBox()
      return box ? box.x + box.width : 0
    }

    await expect(sidebar).toHaveAttribute('data-state', 'fixed')
    expect(await rightEdge()).toBeGreaterThan(200)

    // Hover mode: the panel slides off-screen and the page takes the width.
    await chrome.keyboard.press(`${modifierKey()}+s`)
    await expect(sidebar).toHaveAttribute('data-state', 'hidden')
    await expect.poll(rightEdge, { timeout: 5_000 }).toBeLessThanOrEqual(0)
    await expect(chrome.getByTestId('top-strip')).toBeVisible()

    await chrome.keyboard.press(`${modifierKey()}+s`)
    await expect(sidebar).toHaveAttribute('data-state', 'fixed')
    await expect.poll(rightEdge, { timeout: 5_000 }).toBeGreaterThan(200)
  } finally {
    await app.close()
  }
})

test('palette overlays a live page (screenshot artifact)', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()

    await chrome.keyboard.press(`${modifierKey()}+t`)
    await expect(chrome.getByTestId('palette')).toBeVisible()
    await expect(chrome.getByTestId('palette-input')).toBeFocused()
    await chrome.getByTestId('palette-input').fill('fix')
    await expect(chrome.getByTestId('palette-result').first()).toBeVisible()
    await chrome.waitForTimeout(450) // let the spring settle for a clean artifact
    await chrome.screenshot({ path: 'test-results/phase-b-palette.png' })
    await chrome.keyboard.press('Escape')
    await expect(chrome.getByTestId('palette')).toHaveCount(0)
  } finally {
    await app.close()
    await server.close()
  }
})
