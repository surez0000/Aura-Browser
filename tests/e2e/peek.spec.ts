import { expect, test } from '@playwright/test'
import { createTabViaPalette, launchAurora, pageFor, startFixtureServer } from './helpers'

/**
 * Peek: shift-clicking a link previews it in a floating card without spending
 * a tab. The preview is a native view, so the assertions are on the card's
 * chrome and on the tab list staying untouched until it is promoted.
 */
test('shift-clicking a link peeks it, and Escape dismisses without leaving a tab', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `${server.url}/links.html`)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Links Fixture' })).toBeVisible()
    await expect(chrome.getByTestId('tab-item')).toHaveCount(1)

    const page = await pageFor(app, '/links.html', 10_000)
    expect(page, 'the fixture page should be reachable').not.toBeNull()
    if (!page) return

    await page.click('#go', { modifiers: ['Shift'] })
    await expect(chrome.getByTestId('peek')).toBeVisible()
    // Previewing costs no tab.
    await expect(chrome.getByTestId('tab-item')).toHaveCount(1)

    await chrome.keyboard.press('Escape')
    await expect(chrome.getByTestId('peek')).toHaveCount(0)
    await expect(chrome.getByTestId('tab-item')).toHaveCount(1)
  } finally {
    await app.close()
    await server.close()
  }
})

test('a peek can be promoted to a real tab', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `${server.url}/links.html`)
    await expect(chrome.getByTestId('tab-item')).toHaveCount(1)
    const page = await pageFor(app, '/links.html', 10_000)
    if (!page) return

    await page.click('#go', { modifiers: ['Shift'] })
    await expect(chrome.getByTestId('peek')).toBeVisible()
    await expect(chrome.getByTestId('peek-title')).toContainText(/Fixture B|127\.0\.0\.1/)

    await chrome.getByTestId('peek-promote').click()
    await expect(chrome.getByTestId('peek')).toHaveCount(0)
    await expect(chrome.getByTestId('tab-item')).toHaveCount(2)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture B' })).toBeVisible()
  } finally {
    await app.close()
    await server.close()
  }
})
