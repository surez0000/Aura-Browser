import { expect, test } from '@playwright/test'
import { createTabViaPalette, launchAurora, startFixtureServer } from './helpers'

test('creates, switches, and closes tabs', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    await createTabViaPalette(chrome, `${server.url}/b.html`)

    const items = chrome.getByTestId('tab-item')
    await expect(items).toHaveCount(2)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture B' })).toBeVisible()

    // The most recently created tab is active.
    await expect(items.nth(1)).toHaveAttribute('data-active', 'true')

    // Switch to the first tab.
    await items.nth(0).click()
    await expect(items.nth(0)).toHaveAttribute('data-active', 'true')
    await expect(chrome.getByTestId('url-pill')).toContainText('127.0.0.1')

    // Close the first tab; its neighbor becomes active.
    await items.nth(0).hover()
    await items.nth(0).getByTestId('tab-close').click()
    await expect(items).toHaveCount(1)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture B' })).toBeVisible()
    await expect(items.nth(0)).toHaveAttribute('data-active', 'true')
  } finally {
    await app.close()
    await server.close()
  }
})

test('empty state returns when the last tab closes', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    const item = chrome.getByTestId('tab-item')
    await expect(item).toHaveCount(1)
    await item.hover()
    await item.getByTestId('tab-close').click()
    await expect(chrome.getByTestId('empty-state')).toBeVisible()
  } finally {
    await app.close()
    await server.close()
  }
})
