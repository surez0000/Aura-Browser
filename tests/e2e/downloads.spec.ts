import { expect, test } from '@playwright/test'
import { createTabViaPalette, launchAurora, modifierKey, startFixtureServer } from './helpers'

test('downloads land in the panel and complete', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    // Navigating to an attachment triggers will-download (the nav itself aborts).
    await createTabViaPalette(chrome, `${server.url}/file.bin`)

    await chrome.keyboard.press(`${modifierKey()}+j`)
    await expect(chrome.getByTestId('downloads-flyout')).toBeVisible()

    const item = chrome.getByTestId('download-item').first()
    await expect(item).toBeVisible()
    await expect(item).toContainText('file.bin')
    await expect(item.getByTestId('download-state')).toHaveAttribute('data-state', 'completed', {
      timeout: 15_000,
    })

    // ⌘J toggles the panel closed again.
    await chrome.keyboard.press(`${modifierKey()}+j`)
    await expect(chrome.getByTestId('downloads-flyout')).toHaveCount(0)
  } finally {
    await app.close()
    await server.close()
  }
})
