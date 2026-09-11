import { expect, test } from '@playwright/test'
import { createTabViaPalette, launchAurora, pageFor, startFixtureServer } from './helpers'

test('navigates, then goes back and forward', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    const titleA = chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })
    await expect(titleA).toBeVisible()
    await expect(chrome.getByTestId('url-pill')).toContainText('127.0.0.1')

    // Prefer driving the real page (a WebContentsView) if Playwright exposes it;
    // otherwise navigate via the URL pill. Both paths exercise history.
    const page = await pageFor(app, '/a.html')
    if (page) {
      await page.click('#to-b')
    } else {
      await chrome.getByTestId('url-pill').click()
      const input = chrome.getByTestId('url-input')
      await input.fill(`${server.url}/b.html`)
      await input.press('Enter')
    }
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture B' })).toBeVisible()

    await expect(chrome.getByTestId('nav-back')).toBeEnabled()
    await chrome.getByTestId('nav-back').click()
    await expect(titleA).toBeVisible()

    await expect(chrome.getByTestId('nav-forward')).toBeEnabled()
    await chrome.getByTestId('nav-forward').click()
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture B' })).toBeVisible()
  } finally {
    await app.close()
    await server.close()
  }
})
