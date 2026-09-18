import { expect, test } from '@playwright/test'
import { createTabViaPalette, launchAurora, modifierKey, startFixtureServer } from './helpers'

test('palette switches to a matching open tab', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    await createTabViaPalette(chrome, `${server.url}/b.html`)
    await expect(chrome.getByTestId('tab-item').nth(1)).toHaveAttribute('data-active', 'true')

    await chrome.keyboard.press(`${modifierKey()}+t`)
    await chrome.getByTestId('palette-input').fill('Fixture A')
    const top = chrome.getByTestId('palette-result').first()
    await expect(top).toHaveAttribute('data-type', 'tab')
    await expect(top).toContainText('Fixture A')
    await chrome.getByTestId('palette-input').press('Enter')

    await expect(chrome.getByTestId('tab-item').nth(0)).toHaveAttribute('data-active', 'true')
    await expect(chrome.getByTestId('url-pill')).toContainText('127.0.0.1')
  } finally {
    await app.close()
    await server.close()
  }
})

test('palette reopens a closed page from history', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    await createTabViaPalette(chrome, `${server.url}/b.html`)
    await expect(chrome.getByTestId('tab-item')).toHaveCount(2)

    // Close Fixture B; its visit stays in history.
    const itemB = chrome
      .getByTestId('tab-item')
      .filter({ has: chrome.getByTestId('tab-title').filter({ hasText: 'Fixture B' }) })
    await itemB.hover()
    await itemB.getByTestId('tab-close').click()
    await expect(chrome.getByTestId('tab-item')).toHaveCount(1)

    await chrome.keyboard.press(`${modifierKey()}+t`)
    await chrome.getByTestId('palette-input').fill('Fixture B')
    const historyRow = chrome.getByTestId('palette-result').filter({ hasText: 'Fixture B' }).first()
    await expect(historyRow).toBeVisible()
    await chrome.getByTestId('palette-input').press('Enter')

    await expect(chrome.getByTestId('tab-item')).toHaveCount(2)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture B' })).toBeVisible()
  } finally {
    await app.close()
    await server.close()
  }
})

test('palette action pins and unpins the current tab', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()

    await chrome.keyboard.press(`${modifierKey()}+Shift+P`)
    await chrome.getByTestId('palette-input').fill('pin current')
    const pinAction = chrome
      .getByTestId('palette-result')
      .filter({ hasText: 'Pin Current Tab' })
      .first()
    await expect(pinAction).toBeVisible()
    await pinAction.click()

    const pinned = chrome.getByTestId('section-pinned').getByTestId('tab-item')
    await expect(pinned).toHaveCount(1)
    await expect(chrome.getByTestId('section-today').getByTestId('tab-item')).toHaveCount(0)

    await chrome.keyboard.press(`${modifierKey()}+Shift+P`)
    await chrome.getByTestId('palette-input').fill('unpin current')
    const unpinAction = chrome
      .getByTestId('palette-result')
      .filter({ hasText: 'Unpin Current Tab' })
      .first()
    await expect(unpinAction).toBeVisible()
    await unpinAction.click()
    await expect(chrome.getByTestId('section-today').getByTestId('tab-item')).toHaveCount(1)
  } finally {
    await app.close()
    await server.close()
  }
})

test('the New Tab field lists pages, not commands; commands have their own palette', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()

    // New Tab: a query naming a command offers no command. Rows carry their own
    // type, so this cannot be satisfied by the search row that simply repeats
    // the words back.
    const commandRows = chrome.locator('[data-testid="palette-result"][data-type="action"]')
    await chrome.getByTestId('new-tab-button').click()
    await chrome.getByTestId('palette-input').fill('split view')
    await expect(chrome.getByTestId('palette-result').first()).toBeVisible()
    await expect(commandRows).toHaveCount(0)
    await chrome.keyboard.press('Escape')

    // The command palette is where they live, and it lists nothing else.
    await chrome.keyboard.press(`${modifierKey()}+Shift+P`)
    await chrome.getByTestId('palette-input').fill('split view')
    await expect(commandRows.first()).toBeVisible()
    await expect(chrome.getByTestId('palette-result')).toHaveCount(await commandRows.count())

    // And it opens already showing them, with no typing.
    await chrome.getByTestId('palette-input').fill('')
    await expect(chrome.getByTestId('palette-result').first()).toBeVisible()
  } finally {
    await app.close()
    await server.close()
  }
})
