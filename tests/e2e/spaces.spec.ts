import { expect, test } from '@playwright/test'
import {
  closeAndWaitForExit,
  createTabViaPalette,
  launchAurora,
  modifierKey,
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
    // Open incognito through the command palette.
    await chrome.keyboard.press(`${modifierKey()}+Shift+P`)
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

test('Spaces have separate cookie jars — a login in one never leaks into another', async () => {
  const server = await startFixtureServer()
  const first = await launchAurora()
  const { chrome } = first
  const titled = (page: import('playwright').Page, text: string) =>
    page.getByTestId('tab-title').filter({ hasText: text })
  try {
    // Personal: set a cookie, then read it back on the same site.
    await createTabViaPalette(chrome, `${server.url}/cookie-set.html`)
    await expect(titled(chrome, 'Cookie Set')).toBeVisible()
    await createTabViaPalette(chrome, `${server.url}/cookie-read.html`)
    await expect(titled(chrome, 'Cookie: yes')).toBeVisible()

    // Work: same site, its own empty jar.
    await chrome.getByTestId('space-add').click()
    await chrome.getByTestId('space-name-input').fill('Work')
    await chrome.getByTestId('space-save').click()
    await expect(chrome.getByTestId('space-name')).toHaveText('Work')
    await createTabViaPalette(chrome, `${server.url}/cookie-read.html`)
    await expect(titled(chrome, 'Cookie: none')).toBeVisible()
    await expect(titled(chrome, 'Cookie: yes')).toHaveCount(0)
  } finally {
    await closeAndWaitForExit(first.app)
  }

  // Partitions are persistent: each Space still has its own jar after a restart.
  const second = await launchAurora(first.userDataDir)
  // The tab just created is the active one, and its title is what that page
  // read from the jar. Asserting on it says exactly that, where counting every
  // matching title also folded in whether restored tabs had reloaded yet.
  const activeTitle = (page: import('playwright').Page) =>
    page.locator('[data-testid="tab-item"][data-active] [data-testid="tab-title"]')
  try {
    await expect(second.chrome.getByTestId('space-name')).toHaveText('Work')
    await createTabViaPalette(second.chrome, `${server.url}/cookie-read.html`)
    await expect(activeTitle(second.chrome)).toHaveText('Cookie: none')

    await second.chrome.getByTestId('space-dot').nth(0).click()
    await expect(second.chrome.getByTestId('space-name')).toHaveText('Personal')
    await createTabViaPalette(second.chrome, `${server.url}/cookie-read.html`)
    await expect(activeTitle(second.chrome)).toHaveText('Cookie: yes')
  } finally {
    await second.app.close()
    await server.close()
  }
})
