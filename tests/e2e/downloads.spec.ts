import { expect, test } from '@playwright/test'
import {
  createTabViaPalette,
  launchAurora,
  modifierKey,
  pageFor,
  startFixtureServer,
} from './helpers'

test('downloads land in the panel and complete', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    // Navigating to an attachment triggers will-download (the nav itself aborts).
    await createTabViaPalette(chrome, `${server.url}/file.bin`)

    await chrome.keyboard.press(`${modifierKey()}+j`)
    await expect(chrome.getByTestId('downloads-flyout')).toBeVisible()

    const item = chrome.getByTestId('download-item').first()
    await expect(item).toBeVisible()
    await expect(item).toContainText('file.bin')
    await expect(item.getByTestId('download-state')).toHaveAttribute('data-state', 'completed', {
      timeout: 15_000,
    })

    // ⌘J toggles the panel closed again.
    await chrome.keyboard.press(`${modifierKey()}+j`)
    await expect(chrome.getByTestId('downloads-flyout')).toHaveCount(0)
  } finally {
    await app.close()
    await server.close()
  }
})

test('the downloads section closes like the others, and the button shows progress', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    await expect(chrome.getByTestId('sidebar')).toBeVisible()
    // Nothing running: the button is a plain icon with no ring.
    await expect(chrome.getByTestId('downloads-ring')).toHaveCount(0)

    await createTabViaPalette(chrome, `${server.url}/file.bin`)
    await expect(chrome.getByTestId('downloads-button')).toBeVisible()

    await chrome.getByTestId('downloads-button').click()
    await expect(chrome.getByTestId('downloads-flyout')).toBeVisible()
    // A full section now, so it closes the way History and Settings do.
    await chrome.keyboard.press('Escape')
    await expect(chrome.getByTestId('downloads-flyout')).toHaveCount(0)

    await chrome.getByTestId('downloads-button').click()
    await expect(chrome.getByTestId('downloads-flyout')).toBeVisible()
    await chrome.getByTestId('downloads-close').click()
    await expect(chrome.getByTestId('downloads-flyout')).toHaveCount(0)
  } finally {
    await app.close()
    await server.close()
  }
})

test('a download that starts in the background is announced in a popover by the button', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()
    await createTabViaPalette(chrome, `${server.url}/file.bin`)

    // The popover is a small view of its own, floating above the page.
    const bubble = await pageFor(app, '#download-bubble', 10_000)
    expect(bubble, 'the download popover should open').not.toBeNull()
    if (!bubble) return
    const notice = bubble.getByTestId('download-notice')
    await expect(notice).toBeVisible()
    await expect(notice).toHaveAttribute('data-placement', 'above')
    await expect(bubble.getByTestId('download-notice-name')).toHaveText('file.bin')
    await expect(notice).toHaveAttribute('data-state', 'completed', { timeout: 15_000 })
    await expect(bubble.getByTestId('download-notice-status')).toContainText('Downloaded')
    await expect(bubble.getByTestId('download-notice-open')).toBeVisible()
    await expect(bubble.getByTestId('download-notice-reveal')).toBeVisible()
    // On top of every page view, so the page beside it stays live.
    const topmost = await app.evaluate(({ BrowserWindow }) => {
      const views = BrowserWindow.getAllWindows()[0]?.contentView.children ?? []
      const last = views[views.length - 1] as unknown as { webContents?: { getURL(): string } }
      return last?.webContents?.getURL() ?? ''
    })
    expect(topmost).toContain('#download-bubble')

    // × hides it; the download itself is untouched.
    await bubble.getByTestId('download-notice-dismiss').click()
    await expect(notice).toHaveCount(0)

    // Opening the full list means the popover has nothing left to say.
    await createTabViaPalette(chrome, `${server.url}/file.bin`)
    await expect(bubble.getByTestId('download-notice')).toBeVisible()
    await chrome.keyboard.press(`${modifierKey()}+j`)
    await expect(chrome.getByTestId('downloads-flyout')).toBeVisible()
    await expect(bubble.getByTestId('download-notice')).toHaveCount(0)
    await chrome.keyboard.press('Escape')
    await chrome.waitForTimeout(400)
    await expect(bubble.getByTestId('download-notice')).toHaveCount(0)
  } finally {
    await app.close()
    await server.close()
  }
})
