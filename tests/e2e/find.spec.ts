import { expect, test } from '@playwright/test'
import { createTabViaPalette, launchAurora, modifierKey, startFixtureServer } from './helpers'

test('find-in-page reports matches and closes with Escape', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()

    await chrome.keyboard.press(`${modifierKey()}+f`)
    await expect(chrome.getByTestId('find-bar')).toBeVisible()

    await chrome.getByTestId('find-input').fill('fixture')
    await expect(chrome.getByTestId('find-matches')).toHaveText(/\d+ \/ \d+/)

    await chrome.getByTestId('find-input').press('Escape')
    await expect(chrome.getByTestId('find-bar')).toHaveCount(0)
  } finally {
    await app.close()
    await server.close()
  }
})
