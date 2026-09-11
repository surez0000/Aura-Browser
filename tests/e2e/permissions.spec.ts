import { expect, test } from '@playwright/test'
import { createTabViaPalette, launchAurora, startFixtureServer } from './helpers'

test('permission requests show an in-chrome banner, deny-by-default flow', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `${server.url}/perm.html`)

    const banner = chrome.getByTestId('permission-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('127.0.0.1')
    await expect(banner).toContainText('show notifications')

    await chrome.getByTestId('permission-block').click()
    await expect(banner).toHaveCount(0)
  } finally {
    await app.close()
    await server.close()
  }
})
