import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { createTabViaPalette, launchAurora, modifierKey, startFixtureServer } from './helpers'

const EXTENSION = join(process.cwd(), 'tests', 'e2e', 'fixtures', 'extension')

/** Open the extensions manager through the command palette. */
async function openExtensions(chrome: import('playwright').Page): Promise<void> {
  await chrome.keyboard.press(`${modifierKey()}+Shift+P`)
  await chrome.getByTestId('palette-input').fill('Extensions')
  await chrome.getByTestId('palette-result').filter({ hasText: 'Extensions…' }).first().click()
  await expect(chrome.getByTestId('extensions-panel')).toBeVisible()
}

test('with no extensions the manager explains how to add one', async () => {
  const { app, chrome } = await launchAurora()
  try {
    await openExtensions(chrome)
    await expect(chrome.getByTestId('extension-row')).toHaveCount(0)
    await expect(chrome.getByTestId('extensions-list')).toContainText('No extensions yet')
    // Store installs are off by default, and the panel says what that means.
    await expect(chrome.getByTestId('extensions-allow-store')).not.toBeChecked()
    await expect(chrome.getByTestId('extensions-store-note')).toBeVisible()
  } finally {
    await app.close()
  }
})

test('a loaded extension runs in pages and can be switched off', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora(undefined, {
    env: { AURORA_LOAD_EXTENSION: EXTENSION },
  })
  try {
    // The content script marks every page it runs in.
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    await expect(
      chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A [ext]' }),
    ).toBeVisible({ timeout: 15_000 })

    await openExtensions(chrome)
    const row = chrome.getByTestId('extension-row')
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('Aura Test Extension')
    await expect(row).toContainText('1.2.3')
    await expect(row).toHaveAttribute('data-enabled', 'true')

    // Switching it off unloads it from the session.
    await chrome.getByTestId('extension-toggle').click()
    await expect(row).not.toHaveAttribute('data-enabled', 'true')
    await expect(row).toContainText('off')

    // A page opened now is untouched.
    await chrome.getByTestId('extensions-close').click()
    await createTabViaPalette(chrome, `${server.url}/b.html`)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture B' })).toBeVisible()
    await expect(
      chrome.getByTestId('tab-title').filter({ hasText: 'Fixture B [ext]' }),
    ).toHaveCount(0)
  } finally {
    await app.close()
    await server.close()
  }
})
