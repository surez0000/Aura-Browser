import { expect, test } from '@playwright/test'
import { createTabViaPalette, launchAurora, modifierKey, startFixtureServer } from './helpers'

test('archiving Today keeps the active tab and feeds the palette', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    await createTabViaPalette(chrome, `${server.url}/b.html`)
    await expect(chrome.getByTestId('tab-item')).toHaveCount(2)

    // Archive Today: the active tab (Fixture B) survives.
    await chrome.getByTestId('archive-today').click()
    await expect(chrome.getByTestId('tab-item')).toHaveCount(1)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture B' })).toBeVisible()

    // The archived page is findable and reopenable from the palette.
    await chrome.keyboard.press(`${modifierKey()}+t`)
    await chrome.getByTestId('palette-input').fill('Fixture A')
    const row = chrome.getByTestId('palette-result').filter({ hasText: 'Fixture A' }).first()
    await expect(row).toBeVisible()
    await chrome.getByTestId('palette-input').press('Enter')
    await expect(chrome.getByTestId('tab-item')).toHaveCount(2)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()
  } finally {
    await app.close()
    await server.close()
  }
})
