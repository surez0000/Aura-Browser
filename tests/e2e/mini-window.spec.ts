import { expect, test } from '@playwright/test'
import { launchAurora, startFixtureServer } from './helpers'
import type { Page } from 'playwright'

/** The mini window's own chrome renderer, found among the app's windows. */
async function miniWindow(app: import('playwright').ElectronApplication): Promise<Page | null> {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    for (const page of app.windows()) {
      if (await page.getByTestId('mini-window').count()) return page
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  return null
}

/**
 * A URL handed to Aura Browser by another application opens in its own small
 * window — no tab taken in the main window until it is promoted.
 */
test('a URL from the OS opens a mini window, and it can be promoted to a tab', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora(undefined, { openUrl: `${server.url}/a.html` })
  try {
    await expect(chrome.getByTestId('sidebar')).toBeVisible()
    // The main window is untouched: no tab, still the empty state.
    await expect(chrome.getByTestId('tab-item')).toHaveCount(0)

    const mini = await miniWindow(app)
    expect(mini, 'a mini window should open for the URL').not.toBeNull()
    if (!mini) return

    await expect(mini.getByTestId('mini-title')).toContainText(/Fixture A|127\.0\.0\.1/)
    await expect(mini.getByTestId('mini-page')).toBeVisible()

    // Promote: the page becomes a real tab and the small window goes away.
    await mini.getByTestId('mini-promote').click()
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()
    await expect(chrome.getByTestId('tab-item')).toHaveCount(1)
  } finally {
    await app.close()
    await server.close()
  }
})
