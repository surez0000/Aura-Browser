import { expect, test } from '@playwright/test'
import {
  closeAndWaitForExit,
  createTabViaPalette,
  launchAurora,
  startFixtureServer,
} from './helpers'

test('session restores tabs and the active tab across restarts', async () => {
  const server = await startFixtureServer()
  const first = await launchAurora()
  try {
    await createTabViaPalette(first.chrome, `${server.url}/a.html`)
    await createTabViaPalette(first.chrome, `${server.url}/b.html`)
    await expect(
      first.chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' }),
    ).toBeVisible()
    await expect(
      first.chrome.getByTestId('tab-title').filter({ hasText: 'Fixture B' }),
    ).toBeVisible()
  } finally {
    // Graceful quit runs before-quit -> session save; wait for full exit so the
    // relaunch can take over the profile's single-instance lock.
    await closeAndWaitForExit(first.app)
  }

  const second = await launchAurora(first.userDataDir)
  try {
    const items = second.chrome.getByTestId('tab-item')
    await expect(items).toHaveCount(2)
    await expect(
      second.chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' }),
    ).toBeVisible()
    await expect(
      second.chrome.getByTestId('tab-title').filter({ hasText: 'Fixture B' }),
    ).toBeVisible()
    // The previously active tab (B, index 1) is active again.
    await expect(items.nth(1)).toHaveAttribute('data-active', 'true')
  } finally {
    await second.app.close()
    await server.close()
  }
})
