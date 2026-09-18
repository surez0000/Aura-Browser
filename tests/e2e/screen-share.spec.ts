import { expect, test } from '@playwright/test'
import { createTabViaPalette, launchAurora, pageFor, startFixtureServer } from './helpers'

/**
 * Screen sharing needs a display-media handler on the session: without one
 * Chromium rejects every `getDisplayMedia` call, which is what made sharing
 * impossible before. The picker is the consent — cancelling must deny.
 */
test('a page asking to share gets the picker, and Cancel denies it', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `${server.url}/share.html`)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Share Fixture' })).toBeVisible()

    const page = await pageFor(app, '/share.html', 10_000)
    expect(page, 'the fixture page should be reachable').not.toBeNull()
    if (!page) return

    await page.click('#go')
    // Chromium starts its capture stack on the first request and that can take
    // many seconds on a loaded machine, before our handler is even called; the
    // app warms it at launch, and the dialog opens with a loading state.
    await expect(chrome.getByTestId('screen-share-picker')).toBeVisible({ timeout: 90_000 })
    await expect(chrome.getByTestId('screen-share-host')).toContainText('127.0.0.1')

    await chrome.getByTestId('screen-share-cancel').click()
    await expect(chrome.getByTestId('screen-share-picker')).toHaveCount(0)
    await expect
      .poll(() => page.evaluate('window.__share'), { timeout: 15_000 })
      .toMatch(/^denied:/)
  } finally {
    await app.close()
    await server.close()
  }
})
