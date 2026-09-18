import { expect, test } from '@playwright/test'
import { closeAndWaitForExit, launchAurora } from './helpers'
import type { ElectronApplication } from 'playwright'

/** Labels under the native "Spaces" menu, minus its fixed commands. */
async function spaceMenuEntries(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(({ Menu }) => {
    const spaces = Menu.getApplicationMenu()?.items.find((item) => item.label === 'Spaces')
    const labels = spaces?.submenu?.items.map((item) => item.label) ?? []
    const separator = labels.indexOf('')
    return separator >= 0 ? labels.slice(separator + 1) : []
  })
}

async function createSpace(
  chrome: import('playwright').Page,
  name: string,
  hue: number,
): Promise<void> {
  await chrome.getByTestId('space-add').click()
  await chrome.getByTestId('space-name-input').fill(name)
  await chrome.getByTestId(`space-hue-${hue}`).click()
  await chrome.getByTestId('space-save').click()
  await expect(chrome.getByTestId('space-name')).toHaveText(name)
}

test('the Spaces menu lists the Spaces that exist, and no more', async () => {
  const { app, chrome } = await launchAurora()
  try {
    // A fresh profile has exactly one Space, so the menu has one entry — it
    // used to list nine slots whether or not anything was in them.
    await expect.poll(() => spaceMenuEntries(app)).toEqual(['Personal'])

    await createSpace(chrome, 'Work', 152)
    await expect.poll(() => spaceMenuEntries(app)).toEqual(['Personal', 'Work'])

    await createSpace(chrome, 'Reading', 12)
    await expect.poll(() => spaceMenuEntries(app)).toEqual(['Personal', 'Work', 'Reading'])

    // Removing one takes its entry with it.
    await chrome.getByTestId('space-dot').nth(2).click({ button: 'right' })
    await chrome.getByTestId('space-delete').click()
    await expect.poll(() => spaceMenuEntries(app)).toEqual(['Personal', 'Work'])
  } finally {
    await app.close()
  }
})

test('a Space can be renamed and recoloured, and it sticks', async () => {
  const first = await launchAurora()
  const { chrome } = first
  try {
    await createSpace(chrome, 'Work', 152)

    // Right-clicking a dot edits that Space — the sidebar header is not the
    // only way in, and the compact rail has no header at all.
    await chrome.getByTestId('space-dot').nth(1).click({ button: 'right' })
    await expect(chrome.getByTestId('space-editor')).toBeVisible()
    await expect(chrome.getByTestId('space-name-input')).toHaveValue('Work')
    await expect(chrome.getByTestId('space-gradient-preview')).toBeVisible()

    await chrome.getByTestId('space-name-input').fill('Deep Work')
    await chrome.getByTestId('space-hue-start').fill('200')
    await chrome.getByTestId('space-hue-end').fill('300')
    await chrome.getByTestId('space-save').click()

    await expect(chrome.getByTestId('space-name')).toHaveText('Deep Work')
    await expect(chrome.getByTestId('aurora-backdrop')).toHaveAttribute('data-hue', '200')
  } finally {
    await closeAndWaitForExit(first.app)
  }

  const second = await launchAurora(first.userDataDir)
  try {
    await expect(second.chrome.getByTestId('space-name')).toHaveText('Deep Work')
    await second.chrome.getByTestId('space-dot').nth(1).click({ button: 'right' })
    await expect(second.chrome.getByTestId('space-hue-start')).toHaveValue('200')
    await expect(second.chrome.getByTestId('space-hue-end')).toHaveValue('300')
  } finally {
    await second.app.close()
  }
})
