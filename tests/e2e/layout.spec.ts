import { expect, test } from '@playwright/test'
import {
  closeAndWaitForExit,
  createTabViaPalette,
  launchAurora,
  startFixtureServer,
} from './helpers'

test('tabs can move to a strip on top, and Spaces stay on the left rail', async () => {
  const server = await startFixtureServer()
  const first = await launchAurora()
  const { chrome } = first
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()
    // Side layout: no top strip, and the sidebar lists the tabs.
    await expect(chrome.getByTestId('top-bar')).toHaveCount(0)
    await expect(chrome.getByTestId('tab-item')).toHaveCount(1)

    await chrome.getByTestId('settings-button').click()
    await chrome.getByTestId('setting-tabbar-top').click()
    await chrome.keyboard.press('Escape')

    // The tab is on top now, and the sidebar no longer lists it.
    await expect(chrome.getByTestId('top-bar')).toBeVisible()
    await expect(chrome.getByTestId('top-tab').filter({ hasText: 'Fixture A' })).toBeVisible()
    await expect(chrome.getByTestId('tab-item')).toHaveCount(0)

    // Everything that belongs to the Space stays one click away on the rail.
    await expect(chrome.getByTestId('space-dot').first()).toBeVisible()
    await expect(chrome.getByTestId('downloads-button')).toBeVisible()
    await expect(chrome.getByTestId('settings-button')).toBeVisible()
    // Navigation and the address field moved up with the tabs.
    await expect(chrome.getByTestId('top-bar').getByTestId('nav-back')).toBeVisible()
  } finally {
    await closeAndWaitForExit(first.app)
  }

  const second = await launchAurora(first.userDataDir)
  try {
    await expect(second.chrome.getByTestId('top-bar')).toBeVisible()
    await expect(second.chrome.getByTestId('tab-item')).toHaveCount(0)
  } finally {
    await second.app.close()
    await server.close()
  }
})

test('a tab opened into another Space takes you there, in that Space’s storage', async () => {
  // The page context menu's "Open Link in Space" runs exactly this: create the
  // tab against another Space and activate it. A native menu cannot be clicked
  // from here, so the mechanism underneath it is what gets checked.
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `${server.url}/cookie-set.html`)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Cookie Set' })).toBeVisible()

    await chrome.getByTestId('space-add').click()
    await chrome.getByTestId('space-name-input').fill('Work')
    await chrome.getByTestId('space-save').click()
    await expect(chrome.getByTestId('space-name')).toHaveText('Work')

    // Back to Personal, where the link would be right-clicked.
    await chrome.getByTestId('space-dot').nth(0).click()
    await expect(chrome.getByTestId('space-name')).toHaveText('Personal')

    const workId = (await chrome.evaluate(`(async () => {
      const state = await window.aurora.invoke('state:get', {})
      return state.spaces.find((s) => s.name === 'Work').id
    })()`)) as string

    await chrome.evaluate(
      `window.aurora.invoke('tabs:create', ${JSON.stringify({
        url: `${server.url}/cookie-read.html`,
        spaceId: workId,
        activate: true,
        kind: 'today',
      })})`,
    )

    // It landed in Work, and it went there rather than leaving you behind.
    await expect(chrome.getByTestId('space-name')).toHaveText('Work')
    // Work has its own jar, so the page does not see Personal's cookie.
    await expect(
      chrome.locator('[data-testid="tab-item"][data-active] [data-testid="tab-title"]'),
    ).toHaveText('Cookie: none')
  } finally {
    await app.close()
    await server.close()
  }
})

test('the top address bar shows the whole URL, and the sidebar pill still shows the host', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    const deep = `${server.url}/a.html?section=configuration&view=details`
    await createTabViaPalette(chrome, deep)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()

    // Side layout: the column is narrow, so the pill identifies the page by host.
    const label = chrome.getByTestId('url-label')
    await expect(label).toHaveText(/^127\.0\.0\.1:\d+$/)

    await chrome.getByTestId('settings-button').click()
    await chrome.getByTestId('setting-tabbar-top').click()
    await chrome.keyboard.press('Escape')
    await expect(chrome.getByTestId('top-bar')).toBeVisible()

    // A full-width bar shows the path and query too — the address, not the host.
    await expect(label).toContainText('/a.html?section=configuration&view=details')
    // http:// stays visible; it pairs with the security icon beside it.
    await expect(label).toContainText('http://127.0.0.1')
  } finally {
    await app.close()
    await server.close()
  }
})
