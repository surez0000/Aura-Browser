import { expect, test } from '@playwright/test'
import type { ElectronApplication } from 'playwright'
import { createTabViaPalette, launchAurora, pageFor, startFixtureServer } from './helpers'

/**
 * Sign-in popups: "Sign in with Google" and friends open a popup with window
 * features, report back through `window.opener`, and end with
 * `window.close()`. They used to open as plain tabs, so the opener never heard
 * back, and the page closing itself left a dead tab that crashed main on Reload.
 */

/** URLs of every window that is not the main one: the popups. */
function popupUrls(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(({ BrowserWindow }) => {
    const [main] = BrowserWindow.getAllWindows().sort((a, b) => a.id - b.id)
    return BrowserWindow.getAllWindows()
      .filter((w) => w !== main && !w.isDestroyed())
      .map((w) => w.webContents.getURL())
  })
}

test('a sign-in popup is a real window that reports to its opener and closes', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `${server.url}/signin.html`)
    await expect(
      chrome.getByTestId('tab-title').filter({ hasText: 'Sign-in Fixture' }),
    ).toBeVisible()
    const page = await pageFor(app, '/signin.html', 10_000)
    expect(page, 'the fixture page should be reachable').not.toBeNull()
    if (!page) return

    // Sites see Chrome, not Electron: Google refuses sign-in to the latter.
    const userAgent = await page.evaluate(() => navigator.userAgent)
    expect(userAgent).toContain('Chrome/')
    expect(userAgent).not.toMatch(/Electron|AuraBrowser/)

    await page.click('#signin')
    // Only a popup with an opener can deliver this.
    await expect(page).toHaveTitle('Signed In')
    // It closed itself, and spent no tab on the way.
    await expect.poll(() => popupUrls(app)).toEqual([])
    await expect(chrome.getByTestId('tab-item')).toHaveCount(1)
  } finally {
    await app.close()
    await server.close()
  }
})

test('a popup names its site, and Close Tab inside it closes only the popup', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `${server.url}/signin.html`)
    const page = await pageFor(app, '/signin.html', 10_000)
    expect(page, 'the fixture page should be reachable').not.toBeNull()
    if (!page) return

    await page.click('#signin-stay')
    await expect.poll(() => popupUrls(app)).toEqual([expect.stringContaining('signin-provider')])
    const host = new URL(server.url).host
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((w) => w.webContents.getURL().includes('signin-provider'))
            ?.getTitle(),
        ),
      )
      .toBe(`${host} — Provider Fixture`)

    // ⌘W with the popup focused: the menu hands the click the focused window.
    const clicked = await app.evaluate(({ BrowserWindow, Menu }) => {
      const popup = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes('signin-provider'),
      )
      const file = Menu.getApplicationMenu()?.items.find((item) => item.label === 'File')
      const close = file?.submenu?.items.find((item) => item.label === 'Close Tab')
      close?.click(undefined, popup)
      return !!close && !!popup
    })
    expect(clicked).toBe(true)
    await expect.poll(() => popupUrls(app)).toEqual([])
    await expect(chrome.getByTestId('tab-item')).toHaveCount(1)
    await expect(
      chrome.getByTestId('tab-title').filter({ hasText: 'Sign-in Fixture' }),
    ).toBeVisible()
  } finally {
    await app.close()
    await server.close()
  }
})

test('a page that closes itself takes its tab with it, and Reload still works', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    await createTabViaPalette(chrome, `${server.url}/self-close.html`)
    const items = chrome.getByTestId('tab-item')
    await expect(items).toHaveCount(2)
    const page = await pageFor(app, '/self-close.html', 10_000)
    expect(page, 'the fixture page should be reachable').not.toBeNull()
    if (!page) return

    // Deferred, so the evaluate returns before the page is gone.
    await page.evaluate(() => setTimeout(() => window.close(), 50))
    await expect(items).toHaveCount(1)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()
    await expect(items.nth(0)).toHaveAttribute('data-active', 'true')

    // Reload used to reach the closed page's missing WebContents and throw.
    const reloaded = await app.evaluate(({ Menu }) => {
      const view = Menu.getApplicationMenu()?.items.find((item) => item.label === 'View')
      const reload = view?.submenu?.items.find((item) => item.label === 'Reload')
      if (!reload) return 'missing'
      try {
        reload.click()
        return 'ok'
      } catch (error) {
        return String(error)
      }
    })
    expect(reloaded).toBe('ok')
  } finally {
    await app.close()
    await server.close()
  }
})
