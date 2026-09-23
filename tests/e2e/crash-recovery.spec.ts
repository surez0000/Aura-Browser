import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication } from 'playwright'
import {
  closeAndWaitForExit,
  createTabViaPalette,
  launchAurora,
  startFixtureServer,
} from './helpers'

/** Every page view Aura has open (the chrome itself is a file:// page). */
function pageViews(app: ElectronApplication): Promise<Array<{ url: string; title: string }>> {
  return app.evaluate(({ webContents }) =>
    webContents
      .getAllWebContents()
      .filter((wc) => !wc.getURL().startsWith('file:'))
      .map((wc) => ({ url: wc.getURL(), title: wc.getTitle() })),
  )
}

test('after a crash, the page that was open is not reopened by itself', async () => {
  const server = await startFixtureServer()
  const first = await launchAurora()
  try {
    await createTabViaPalette(first.chrome, `${server.url}/a.html`)
    await expect(
      first.chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' }),
    ).toBeVisible()
  } finally {
    await closeAndWaitForExit(first.app)
  }

  // What a crash leaves behind: the marker a clean quit removes.
  writeFileSync(join(first.userDataDir, '.running'), '')
  const second = await launchAurora(first.userDataDir)
  try {
    // The tab is back under its own title, but its page stayed closed behind
    // a note — so a page that crashes Aura can't do it on every launch.
    await expect(
      second.chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' }),
    ).toBeVisible()
    await expect
      .poll(async () => (await pageViews(second.app)).some((v) => v.title === 'Not reopened'))
      .toBe(true)
    expect((await pageViews(second.app)).some((v) => v.url.includes('/a.html'))).toBe(false)

    // Reload opens it after all.
    await second.chrome.evaluate(`window.aurora.invoke('tabs:reload', {})`)
    await expect
      .poll(async () => (await pageViews(second.app)).some((v) => v.url.includes('/a.html')))
      .toBe(true)
  } finally {
    await closeAndWaitForExit(second.app)
    await server.close()
  }
})
