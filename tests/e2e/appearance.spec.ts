import { expect, test } from '@playwright/test'
import {
  closeAndWaitForExit,
  createTabViaPalette,
  launchAurora,
  modifierKey,
  startFixtureServer,
} from './helpers'

/**
 * The window used to open at a fixed size however it was left, and there was
 * no way back from the full sidebar to the rail. Both are appearance promises
 * the browser has to keep across a restart.
 */

test('the window reopens at the size and position it was left', async () => {
  let left: { x: number; y: number; width: number; height: number }
  const first = await launchAurora()
  try {
    await expect(first.chrome.getByTestId('sidebar')).toBeVisible()
    // Read back what the window actually became: a small display (CI runners
    // have one) clamps the request, and the promise under test is that it
    // reopens as it was *left*, not as it was asked for.
    left = await first.app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]!
      win.setBounds({ x: 80, y: 60, width: 900, height: 640 })
      return win.getNormalBounds()
    })
    // The save is debounced, so give it a moment to reach the store.
    await first.chrome.waitForTimeout(900)
  } finally {
    await closeAndWaitForExit(first.app)
  }

  const second = await launchAurora(first.userDataDir)
  try {
    const bounds = await second.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.getNormalBounds(),
    )
    expect(bounds.width).toBe(left.width)
    expect(bounds.height).toBe(left.height)
    expect(Math.abs(bounds.x - left.x)).toBeLessThanOrEqual(2)
    expect(Math.abs(bounds.y - left.y)).toBeLessThanOrEqual(2)
    // And not simply the default it used to always open at.
    expect(bounds.width).not.toBe(1360)
  } finally {
    await second.app.close()
  }
})

test('the full sidebar can be collapsed back to the rail from its own button', async () => {
  const { app, chrome } = await launchAurora()
  try {
    const shell = chrome.getByTestId('sidebar')
    await expect(shell).toBeVisible()

    // Full sidebar: a collapse button, which the rail's expand button mirrors.
    await chrome.getByTestId('sidebar-collapse').click()
    await expect(chrome.getByTestId('sidebar-expand')).toBeVisible()
    await expect(chrome.getByTestId('sidebar-collapse')).toHaveCount(0)

    await chrome.getByTestId('sidebar-expand').click()
    await expect(chrome.getByTestId('sidebar-collapse')).toBeVisible()
  } finally {
    await app.close()
  }
})

test('the backdrop texture is off by default, and the choice survives a restart', async () => {
  const first = await launchAurora()
  const { chrome } = first
  try {
    await expect(chrome.getByTestId('backdrop-texture')).toHaveCount(0)

    await chrome.getByTestId('settings-button').click()
    await chrome.getByTestId('setting-texture-particles').click()
    await expect(chrome.getByTestId('backdrop-particles')).toBeVisible()
    await chrome.keyboard.press('Escape')

    await chrome.getByTestId('settings-button').click()
    await chrome.getByTestId('setting-texture-grain').click()
    await expect(chrome.getByTestId('backdrop-texture')).toHaveAttribute('data-texture', 'grain')
    await chrome.keyboard.press('Escape')
  } finally {
    await closeAndWaitForExit(first.app)
  }

  const second = await launchAurora(first.userDataDir)
  try {
    await expect(second.chrome.getByTestId('backdrop-texture')).toHaveAttribute(
      'data-texture',
      'grain',
    )
  } finally {
    await second.app.close()
  }
})

test('settings closes on Escape and on the scrim, not only on the gear', async () => {
  const { app, chrome } = await launchAurora()
  try {
    await chrome.getByTestId('settings-button').click()
    await expect(chrome.getByTestId('settings-flyout')).toBeVisible()
    await chrome.keyboard.press('Escape')
    await expect(chrome.getByTestId('settings-flyout')).toHaveCount(0)

    await chrome.getByTestId('settings-button').click()
    await expect(chrome.getByTestId('settings-flyout')).toBeVisible()
    // Click the scrim well clear of the dialog, which is centred near the top.
    await chrome.mouse.click(60, 600)
    await expect(chrome.getByTestId('settings-flyout')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('the Space gradient preview shows the backdrop colours, not the pale accent', async () => {
  const { app, chrome } = await launchAurora()
  try {
    await expect(chrome.getByTestId('sidebar')).toBeVisible()
    // Force dark, where the accent is lifted for legibility and so reads far
    // lighter than the backdrop it is supposed to be previewing.
    await chrome.getByTestId('settings-button').click()
    await chrome.getByTestId('setting-theme-dark').click()
    await chrome.keyboard.press('Escape')

    await chrome.getByTestId('space-dot').first().click({ button: 'right' })
    const preview = chrome.getByTestId('space-gradient-preview')
    await expect(preview).toBeVisible()

    // The preview must be dark in dark mode. Read its own gradient stops.
    // (String form: this tsconfig has no DOM lib, as elsewhere in the suite.)
    const luminance = (await chrome.evaluate(String.raw`(() => {
      const el = document.querySelector('[data-testid="space-gradient-preview"]')
      const stops = getComputedStyle(el).backgroundImage.match(/rgba?\([^)]+\)/g) || []
      const values = stops.map(function (stop) {
        const p = stop
          .replace(/rgba?\(|\)/g, '')
          .split(/[\s,/]+/)
          .filter(function (t) { return t.length > 0 })
          .map(Number)
        return (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255
      })
      return values.length ? Math.max.apply(null, values) : 1
    })()`)) as number
    expect(luminance).toBeLessThan(0.45)

    // And it opens on the Space's own stops. A Space with no stored second
    // stop uses the default spread from the first; the editor used to seed a
    // rotating preset instead, so it showed colours the Space never had.
    const stops = (await chrome.evaluate(String.raw`(() => {
      const start = document.querySelector('[data-testid="space-hue-start"]')
      const end = document.querySelector('[data-testid="space-hue-end"]')
      return { start: Number(start.value), end: Number(end.value) }
    })()`)) as { start: number; end: number }
    const spread = (((stops.end - stops.start) % 360) + 360) % 360
    expect(spread).toBeLessThanOrEqual(90)
  } finally {
    await app.close()
  }
})

test('dialogs over a page really blur it, with no ancestor blocking the effect', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()

    await chrome.keyboard.press(`${modifierKey()}+y`)
    await expect(chrome.getByTestId('history-panel')).toBeVisible()

    // `backdrop-filter` is undone by any ancestor that groups its subtree —
    // an animated opacity is the usual culprit, and is what silently turned
    // these dialogs into flat panels once before.
    const blur = (await chrome.evaluate(String.raw`(() => {
      const el = document.querySelector('[data-testid="history-panel"] .dialog')
      const own = getComputedStyle(el).backdropFilter
      const grouping = []
      let node = el.parentElement
      while (node) {
        const style = getComputedStyle(node)
        if (Number(style.opacity) < 1) grouping.push('opacity ' + style.opacity)
        if (style.filter !== 'none') grouping.push('filter ' + style.filter)
        node = node.parentElement
      }
      return { own: own, grouping: grouping }
    })()`)) as { own: string; grouping: string[] }
    expect(blur.own).toContain('blur')
    expect(blur.grouping).toEqual([])
  } finally {
    await app.close()
    await server.close()
  }
})

test('the chosen option in a settings control is visible in both themes', async () => {
  const { app, chrome } = await launchAurora()
  try {
    for (const theme of ['light', 'dark'] as const) {
      await chrome.getByTestId('settings-button').click()
      await chrome.getByTestId(`setting-theme-${theme}`).click()

      // The selected pill used to be built from the glass tokens, which are
      // white on white in the light theme: it painted at a contrast ratio of
      // exactly 1.00 against the dialog, so nothing looked chosen at all. It
      // now carries its own token; the unit sweep checks that token's
      // contrast, and this checks the control is actually wired to it.
      const backgrounds = (await chrome.evaluate(String.raw`(() => {
        const chosen = document.querySelector('[data-testid="setting-sidebar-fixed"]')
        const other = document.querySelector('[data-testid="setting-sidebar-compact"]')
        const token = getComputedStyle(document.documentElement)
          .getPropertyValue('--surface-selected')
          .trim()
        return {
          chosen: getComputedStyle(chosen).backgroundColor,
          other: getComputedStyle(other).backgroundColor,
          token: token,
        }
      })()`)) as { chosen: string; other: string; token: string }

      expect(backgrounds.token, `${theme} token`).not.toBe('')
      // Painted, not transparent, and plainly different from its neighbour.
      expect(backgrounds.chosen, `${theme} chosen`).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
      expect(backgrounds.other, `${theme} unchosen`).toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
      expect(backgrounds.chosen).not.toBe(backgrounds.other)
      await chrome.keyboard.press('Escape')
    }
  } finally {
    await app.close()
  }
})
