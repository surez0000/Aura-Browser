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

test('a local address typed without a scheme loads the machine, not a search', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    // Exactly what a user types for a machine on their network: no scheme.
    // This used to become a web search, and before that an https:// URL that
    // could not connect, because only names with a dot counted as addresses.
    const bare = `${server.url.replace('http://', '')}/a.html`
    await chrome.getByTestId('new-tab-button').click()
    await chrome.getByTestId('palette-input').fill(bare)

    // The palette offers the machine itself, above the search fallback.
    const top = chrome.getByTestId('palette-result').first()
    await expect(top).toHaveAttribute('data-type', 'url')
    await chrome.getByTestId('palette-input').press('Enter')

    // And it really loads: the title only appears if the page was fetched.
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()
    await expect(chrome.getByTestId('url-pill')).toContainText('127.0.0.1')
  } finally {
    await app.close()
    await server.close()
  }
})
