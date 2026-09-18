import { expect, test } from '@playwright/test'
import { closeAndWaitForExit, launchAurora, modifierKey } from './helpers'

test('settings panel changes the search engine; the palette follows and it persists', async () => {
  const first = await launchAurora()
  const { chrome } = first
  try {
    // ⌘, opens the panel; the gear closes it.
    await chrome.keyboard.press(`${modifierKey()}+,`)
    await expect(chrome.getByTestId('settings-flyout')).toBeVisible()
    // Version-agnostic: the label must name the app and a semver, not a release.
    await expect(chrome.getByTestId('app-version')).toHaveText(/^Aura Browser \d+\.\d+\.\d+$/)
    await expect(chrome.getByTestId('updates-status')).toContainText('installed builds')

    await chrome.getByTestId('setting-search-engine').selectOption('google')
    // The dialog closes from its own close button, the scrim, or Escape.
    await chrome.getByTestId('settings-close').click()
    await expect(chrome.getByTestId('settings-flyout')).toHaveCount(0)

    await chrome.getByTestId('new-tab-button').click()
    await chrome.getByTestId('palette-input').fill('aurora borealis')
    await expect(
      chrome.getByTestId('palette-result').filter({ hasText: 'Search Google for' }),
    ).toBeVisible()
    await expect(chrome.getByTestId('palette')).toContainText('Searches Google')
    await chrome.keyboard.press('Escape')
  } finally {
    await closeAndWaitForExit(first.app)
  }

  const second = await launchAurora(first.userDataDir)
  try {
    await second.chrome.getByTestId('settings-button').click()
    await expect(second.chrome.getByTestId('setting-search-engine')).toHaveValue('google')
  } finally {
    await second.app.close()
  }
})

test('the sidebar mode chosen in Settings persists across a restart', async () => {
  const first = await launchAurora()
  const { chrome } = first
  try {
    await chrome.getByTestId('settings-button').click()
    await chrome.getByTestId('setting-sidebar-compact').click()
    await expect(chrome.getByTestId('sidebar')).toHaveAttribute('data-state', 'compact')
  } finally {
    await closeAndWaitForExit(first.app)
  }

  const second = await launchAurora(first.userDataDir)
  try {
    await expect(second.chrome.getByTestId('sidebar')).toHaveAttribute('data-state', 'compact')
  } finally {
    await second.app.close()
  }
})
