import { expect, test } from '@playwright/test'
import {
  closeAndWaitForExit,
  createTabViaPalette,
  launchAurora,
  modifierKey,
  startFixtureServer,
} from './helpers'

/**
 * Split view. The page area is native views the main process positions, so the
 * checks are on the measured pane frames the renderer reports (ADR-0003).
 */
test('⌘\\ splits and collapses, panes resize, and a pane can be closed', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()

    const area = chrome.getByTestId('pane-area')
    const cards = chrome.getByTestId('page-card')
    await expect(area).toHaveAttribute('data-panes', '1')
    await expect(chrome.getByTestId('pane-header')).toHaveCount(0)

    // Split: a second pane opens beside the first and takes the address field.
    await chrome.keyboard.press(`${modifierKey()}+\\`)
    await expect(area).toHaveAttribute('data-panes', '2')
    await expect(cards).toHaveCount(2)
    await expect(chrome.getByTestId('pane-header')).toHaveCount(2)
    await expect(chrome.getByTestId('pane-divider')).toHaveCount(1)
    // The fresh pane takes the address field; dismiss it and let the new pane
    // ratios arrive from the main process before any pointer work.
    await chrome.keyboard.press('Escape')
    await expect
      .poll(async () => (await chrome.getByTestId('pane-divider').first().boundingBox())?.x ?? 0)
      .toBeGreaterThan(0)
    await chrome.waitForTimeout(400)

    const widths = async (): Promise<number[]> => {
      const boxes = await Promise.all((await cards.all()).map((c) => c.boundingBox()))
      return boxes.map((b) => Math.round(b?.width ?? 0))
    }
    const [leftBefore, rightBefore] = await widths()
    expect(Math.abs((leftBefore ?? 0) - (rightBefore ?? 0))).toBeLessThan(4)

    // Drag the divider: the left pane narrows, the right widens.
    const divider = chrome.getByTestId('pane-divider').first()
    const box = await divider.boundingBox()
    if (!box) throw new Error('divider not laid out')
    await chrome.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await chrome.mouse.down()
    await chrome.mouse.move(box.x - 150, box.y + box.height / 2, { steps: 10 })
    await chrome.mouse.up()
    await expect.poll(async () => (await widths())[0] ?? 0).toBeLessThan((leftBefore ?? 0) - 80)
    const [, rightAfter] = await widths()
    expect(rightAfter ?? 0).toBeGreaterThan(rightBefore ?? 0)

    // Closing a pane leaves the split but keeps the tab open.
    const tabsBefore = await chrome.getByTestId('tab-item').count()
    await chrome.getByTestId('pane-close').first().click()
    await expect(area).toHaveAttribute('data-panes', '1')
    expect(await chrome.getByTestId('tab-item').count()).toBe(tabsBefore)

    // ⌘\ again splits, and once more collapses to the focused pane.
    await chrome.keyboard.press(`${modifierKey()}+\\`)
    await expect(area).toHaveAttribute('data-panes', '2')
    await chrome.keyboard.press(`${modifierKey()}+\\`)
    await expect(area).toHaveAttribute('data-panes', '1')
  } finally {
    await app.close()
    await server.close()
  }
})

test('choosing a tab while split replaces the focused pane, and the split is restored', async () => {
  const server = await startFixtureServer()
  const first = await launchAurora()
  const { chrome } = first
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    await createTabViaPalette(chrome, `${server.url}/b.html`)
    await expect(chrome.getByTestId('tab-item')).toHaveCount(2)

    // Split, then put Fixture A into the focused (right) pane.
    await chrome.keyboard.press(`${modifierKey()}+\\`)
    await expect(chrome.getByTestId('pane-area')).toHaveAttribute('data-panes', '2')
    await chrome.keyboard.press('Escape') // dismiss the address editor
    await chrome.getByTestId('tab-item').first().click()

    // Still two panes: the sidebar swapped a pane rather than collapsing.
    await expect(chrome.getByTestId('pane-area')).toHaveAttribute('data-panes', '2')
    await expect(chrome.getByTestId('pane-title').filter({ hasText: 'Fixture A' })).toHaveCount(1)
  } finally {
    await closeAndWaitForExit(first.app)
  }

  // The split comes back after a restart.
  const second = await launchAurora(first.userDataDir)
  try {
    await expect(second.chrome.getByTestId('pane-area')).toHaveAttribute('data-panes', '2')
    await expect(second.chrome.getByTestId('pane-header')).toHaveCount(2)
  } finally {
    await second.app.close()
    await server.close()
  }
})
