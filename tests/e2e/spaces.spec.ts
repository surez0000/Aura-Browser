import { expect, test } from '@playwright/test'
import {
  closeAndWaitForExit,
  createTabViaPalette,
  launchAurora,
  startFixtureServer,
} from './helpers'

test('creates a space, keeps tabs per space, and persists across restarts', async () => {
  const server = await startFixtureServer()
  const first = await launchAurora()
  const { chrome } = first
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()

    // Create a second space via the switcher rail.
    await chrome.getByTestId('space-add').click()
    await chrome.getByTestId('space-name-input').fill('Work')
    await chrome.getByTestId('space-save').click()
    await expect(chrome.getByTestId('space-dot')).toHaveCount(2)
    await expect(chrome.getByTestId('space-name')).toHaveText('Work')
    await expect(chrome.getByTestId('tab-item')).toHaveCount(0)
    // The empty state is per-Space: it shows here although Personal still has a tab.
    await expect(chrome.getByTestId('empty-state')).toBeVisible()

    // A tab created here belongs to Work only.
    await createTabViaPalette(chrome, `${server.url}/b.html`)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture B' })).toBeVisible()
    await expect(chrome.getByTestId('tab-item')).toHaveCount(1)

    // Switch back to the first space by clicking its dot.
    await chrome.getByTestId('space-dot').nth(0).click()
    await expect(chrome.getByTestId('space-name')).toHaveText('Personal')
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture B' })).toHaveCount(0)

    // Back to Work; it must be the restored active space after relaunch.
    await chrome.getByTestId('space-dot').nth(1).click()
    await expect(chrome.getByTestId('space-name')).toHaveText('Work')
  } finally {
    await closeAndWaitForExit(first.app)
  }

  const second = await launchAurora(first.userDataDir)
  try {
    await expect(second.chrome.getByTestId('space-dot')).toHaveCount(2)
    await expect(second.chrome.getByTestId('space-name')).toHaveText('Work')
    await expect(
      second.chrome.getByTestId('tab-title').filter({ hasText: 'Fixture B' }),
    ).toBeVisible()
  } finally {
    await second.app.close()
    await server.close()
  }
})

test('drags a tab onto a space dot to move it', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()

    await chrome.getByTestId('space-add').click()
    await chrome.getByTestId('space-name-input').fill('Work')
    await chrome.getByTestId('space-save').click()
    await chrome.getByTestId('space-dot').nth(0).click()
    await expect(chrome.getByTestId('space-name')).toHaveText('Personal')

    const item = chrome.getByTestId('tab-item').first()
    const itemBox = await item.boundingBox()
    const dotBox = await chrome.getByTestId('space-dot').nth(1).boundingBox()
    expect(itemBox && dotBox).toBeTruthy()
    if (!itemBox || !dotBox) return

    await chrome.mouse.move(itemBox.x + itemBox.width / 2, itemBox.y + itemBox.height / 2)
    await chrome.mouse.down()
    // Drag in steps so motion registers a real gesture, then drop on the dot.
    await chrome.mouse.move(dotBox.x + dotBox.width / 2, dotBox.y + dotBox.height / 2, {
      steps: 14,
    })
    await chrome.mouse.up()

    // The tab left Personal…
    await expect(chrome.getByTestId('tab-item')).toHaveCount(0)
    // The empty state is per-Space: it shows here although Personal still has a tab.
    await expect(chrome.getByTestId('empty-state')).toBeVisible()
    // …and lives in Work now.
    await chrome.getByTestId('space-dot').nth(1).click()
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()
  } finally {
    await app.close()
    await server.close()
  }
})

test('incognito space is ephemeral', async () => {
  const server = await startFixtureServer()
  const first = await launchAurora()
  const { chrome } = first
  try {
    // Open incognito through the palette action.
    await chrome.getByTestId('new-tab-button').click()
    await chrome.getByTestId('palette-input').fill('incognito')
    await expect(
      chrome.getByTestId('palette-result').filter({ hasText: 'New Incognito Tab' }).first(),
    ).toBeVisible()
    await chrome.getByTestId('palette-input').press('Enter')

    await expect(chrome.getByTestId('incognito-badge')).toBeVisible()
    await expect(chrome.getByTestId('space-dot')).toHaveCount(2)

    // The palette reopens for the incognito tab's URL.
    await expect(chrome.getByTestId('palette-input')).toBeVisible()
    await chrome.getByTestId('palette-input').fill(`${server.url}/a.html`)
    await chrome.getByTestId('palette-input').press('Enter')
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()
  } finally {
    await closeAndWaitForExit(first.app)
  }

  const second = await launchAurora(first.userDataDir)
  try {
    await expect(second.chrome.getByTestId('space-dot')).toHaveCount(1)
    await expect(second.chrome.getByTestId('incognito-badge')).toHaveCount(0)
  } finally {
    await second.app.close()
    await server.close()
  }
})
