import { expect, test } from '@playwright/test'
import { createTabViaPalette, launchAurora, pageFor, startFixtureServer } from './helpers'

/**
 * Screen sharing needs a display-media handler on the session: without one
 * Chromium rejects every `getDisplayMedia` call, which is what made sharing
 * impossible before. The picker is the consent — cancelling must deny.
 */
test('a page asking to share gets the picker, and Cancel denies it', async () => {
  // Chromium's capture stack can take a long time to start on a busy machine,
  // and macOS may put up its own Screen Recording prompt that no test can
  // answer. So: skip when the system has not granted capture, and allow a
  // generous ceiling when it has.
  test.slow()
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    const access = await app.evaluate(({ systemPreferences }) =>
      process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'granted',
    )
    test.skip(access !== 'granted', 'screen recording is not granted to this binary')
    await createTabViaPalette(chrome, `${server.url}/share.html`)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Share Fixture' })).toBeVisible()

    const page = await pageFor(app, '/share.html', 10_000)
    expect(page, 'the fixture page should be reachable').not.toBeNull()
    if (!page) return

    await page.click('#go')
    // Chromium starts its capture stack on the first request and that can take
    // many seconds on a loaded machine, before our handler is even called; the
    // app warms it at launch, and the dialog opens with a loading state.
    await expect(chrome.getByTestId('screen-share-picker')).toBeVisible({ timeout: 45_000 })
    await expect(chrome.getByTestId('screen-share-host')).toContainText('127.0.0.1')
    // Sharing a screen must never ask for the camera and microphone: the
    // picker is the consent. That prompt used to race the picker and could
    // leave sharing working only once it had been allowed by hand.
    await expect(chrome.getByTestId('permission-banner')).toHaveCount(0)

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
