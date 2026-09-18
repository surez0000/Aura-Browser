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
