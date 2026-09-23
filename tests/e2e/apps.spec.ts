import { expect, test } from '@playwright/test'
import {
  closeAndWaitForExit,
  createTabViaPalette,
  launchAurora,
  modifierKey,
  startFixtureServer,
} from './helpers'
import type { Page } from 'playwright'

async function openStore(chrome: Page): Promise<void> {
  await chrome.getByTestId('apps-button').click()
  await expect(chrome.getByTestId('app-store')).toBeVisible()
}

test('an app is off until the Store switches it on, and then it is pinned', async () => {
  const { app, chrome } = await launchAurora()
  try {
    // Nothing is pinned to begin with: someone who wants no apps sees none.
    await expect(chrome.getByTestId('pinned-app')).toHaveCount(0)
    // But the way in is on screen regardless — it used to live only in a menu,
    // so nothing suggested apps existed until you already knew.
    await expect(chrome.getByTestId('apps-button')).toBeVisible()

    await openStore(chrome)
    const notes = chrome.locator('[data-testid="app-row"][data-app="notes"]')
    await expect(notes).toHaveCount(1)
    await expect(notes).not.toHaveAttribute('data-enabled', 'true')
    // All three apps are real now: each is a switch, none is "coming next".
    await expect(chrome.getByTestId('app-row')).toHaveCount(3)
    await expect(chrome.getByTestId('app-row-upcoming')).toHaveCount(0)

    await notes.getByTestId('app-toggle').click()
    await expect(notes).toHaveAttribute('data-enabled', 'true')

    await chrome.getByTestId('app-store-close').click()
    await expect(chrome.locator('[data-testid="pinned-app"][data-app="notes"]')).toBeVisible()

    // Unpinning leaves it switched on, it just stops taking rail space.
    await openStore(chrome)
    await notes.getByTestId('app-pin').click()
    await chrome.getByTestId('app-store-close').click()
    await expect(chrome.getByTestId('pinned-app')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('a sticky keeps the page it was written on, survives a restart, and is findable', async () => {
  const server = await startFixtureServer()
  const first = await launchAurora()
  const { chrome } = first
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()

    await openStore(chrome)
    await chrome
      .locator('[data-testid="app-row"][data-app="notes"] [data-testid="app-toggle"]')
      .click()
    await chrome.getByTestId('app-store-close').click()

    // ⌘E opens a sticky to write on. Nothing is stored yet.
    await chrome.keyboard.press(`${modifierKey()}+e`)
    await expect(chrome.getByTestId('note-editor-card')).toBeVisible()
    await expect(chrome.getByTestId('note-title-input')).toBeFocused()
    await expect(chrome.getByTestId('note-item')).toHaveCount(0)

    await chrome.getByTestId('note-title-input').fill('Ask about the pricing tiers')
    await chrome.getByTestId('note-editor').fill('they moved the middle plan')
    // Colour is how a sticky is found before it is read.
    await chrome.locator('[data-testid="note-color"][data-color="amber"]').click()
    await expect(chrome.getByTestId('note-saved')).toBeVisible()

    // It carries the page it was written on.
    await expect(chrome.getByTestId('note-open-page')).toContainText('Fixture A')
    // Escape puts the sticky down; the board keeps it.
    await chrome.keyboard.press('Escape')
    await expect(chrome.getByTestId('note-editor-card')).toHaveCount(0)
    const card = chrome.getByTestId('note-item')
    await expect(card).toHaveCount(1)
    await expect(card).toHaveAttribute('data-color', 'amber')

    // Pinning keeps it at the top of the board.
    await card.getByTestId('note-pin').click()
    await expect(card).toHaveAttribute('data-pinned', 'true')
    await chrome.getByTestId('notes-panel-close').click()
  } finally {
    await closeAndWaitForExit(first.app)
  }

  const second = await launchAurora(first.userDataDir)
  try {
    await expect(
      second.chrome.locator('[data-testid="pinned-app"][data-app="notes"]'),
    ).toBeVisible()

    // Found by a word from the body, not just the title.
    await second.chrome.keyboard.press(`${modifierKey()}+t`)
    await second.chrome.getByTestId('palette-input').fill('moved')
    const noteRow = second.chrome
      .locator('[data-testid="palette-result"][data-type="note"]')
      .first()
    await expect(noteRow).toContainText('Ask about the pricing tiers')
    await noteRow.click()

    // Choosing it opens that sticky, colour and all.
    await expect(second.chrome.getByTestId('note-editor-card')).toBeVisible()
    await expect(second.chrome.getByTestId('note-editor')).toHaveValue(/moved/)
  } finally {
    await second.app.close()
    await server.close()
  }
})

test('pressing ⌘E and changing your mind leaves nothing behind', async () => {
  const { app, chrome } = await launchAurora()
  try {
    await openStore(chrome)
    await chrome
      .locator('[data-testid="app-row"][data-app="notes"] [data-testid="app-toggle"]')
      .click()
    await chrome.getByTestId('app-store-close').click()

    await chrome.keyboard.press(`${modifierKey()}+e`)
    await expect(chrome.getByTestId('note-editor-card')).toBeVisible()
    await chrome.keyboard.press('Escape')

    // No husk: earlier builds wrote the note the moment the shortcut was hit.
    await expect(chrome.getByTestId('note-item')).toHaveCount(0)
    await expect(chrome.getByTestId('notes-board')).toContainText('The board is empty')
  } finally {
    await app.close()
  }
})

test('the sidebar footer and the right bar keep every control clear of the others', async () => {
  const { app, chrome } = await launchAurora()
  try {
    // The most either has to carry: every app pinned, and more Spaces than
    // would ever fit in one row. The dots used to share a row with the
    // buttons, squeezed into whatever width was left, and spilled under them.
    for (const id of ['notes', 'reminders', 'timesheet']) {
      await chrome.evaluate(
        `window.aurora.invoke('apps:setEnabled', { id: '${id}', enabled: true })`,
      )
    }
    for (let i = 1; i <= 7; i++) {
      await chrome.evaluate(
        `window.aurora.invoke('spaces:create', { name: 'Space ${i}', accentHue: ${i * 45} })`,
      )
    }
    await expect(chrome.getByTestId('pinned-app')).toHaveCount(3)
    await expect(chrome.getByTestId('space-dot')).toHaveCount(8)

    // Space dots, Downloads and Settings in the sidebar; the apps at the foot
    // of the bar on the right.
    const boxes = (await chrome.evaluate(String.raw`(() => {
      const box = (id) => document.querySelector('[data-testid="' + id + '"]').getBoundingClientRect()
      const bars = { sidebar: box('sidebar'), 'right-bar': box('right-bar') }
      const home = { 'space-dot': 'sidebar', 'space-add': 'sidebar', 'downloads-button': 'sidebar',
        'settings-button': 'sidebar', 'pinned-app': 'right-bar', 'apps-button': 'right-bar' }
      const sel = Object.keys(home).map((id) => '[data-testid="' + id + '"]').join(',')
      return [...document.querySelectorAll(sel)].map((el) => {
        const id = el.getAttribute('data-testid')
        const r = el.getBoundingClientRect()
        const bar = bars[home[id]]
        return { id, l: r.left, t: r.top, r: r.right, b: r.bottom,
          inside: r.left >= bar.left && r.right <= bar.right && r.bottom <= bar.bottom }
      })
    })()`)) as { id: string; l: number; t: number; r: number; b: number; inside: boolean }[]

    expect(boxes).toHaveLength(8 + 1 + 1 + 1 + 3 + 1)
    for (const box of boxes) expect(box, `${box.id} inside its bar`).toMatchObject({ inside: true })
    const clashes: string[] = []
    boxes.forEach((a, i) =>
      boxes.slice(i + 1).forEach((b) => {
        if (a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b) clashes.push(`${a.id} × ${b.id}`)
      }),
    )
    expect(clashes).toEqual([])
  } finally {
    await app.close()
  }
})
