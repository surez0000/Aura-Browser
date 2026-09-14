import { expect, test } from '@playwright/test'
import { launchAurora, modifierKey } from './helpers'

// String-form evaluate: runs in the page, no DOM lib needed in the e2e tsconfig.
async function bgBaseVar(chrome: import('playwright').Page): Promise<string> {
  return chrome.evaluate(
    `getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim()`,
  )
}

function themeAttr(chrome: import('playwright').Page): Promise<string | undefined> {
  return chrome.evaluate(`document.documentElement.dataset.theme`)
}

async function runThemeAction(chrome: import('playwright').Page, label: string): Promise<void> {
  await chrome.keyboard.press(`${modifierKey()}+t`)
  await chrome.getByTestId('palette-input').fill(label)
  const row = chrome.getByTestId('palette-result').filter({ hasText: label }).first()
  await expect(row).toBeVisible()
  await row.click()
}

test('theme switches light/dark via palette actions (tokens re-injected)', async () => {
  const { app, chrome } = await launchAurora()
  try {
    await runThemeAction(chrome, 'Theme: Light')
    await expect.poll(() => themeAttr(chrome)).toBe('light')
    expect(await bgBaseVar(chrome)).toBe('rgb(233, 236, 246)')

    await runThemeAction(chrome, 'Theme: Dark')
    await expect.poll(() => themeAttr(chrome)).toBe('dark')
    expect(await bgBaseVar(chrome)).toBe('rgb(12, 14, 26)')
  } finally {
    await app.close()
  }
})

test('aurora backdrop follows the active space palette', async () => {
  const { app, chrome } = await launchAurora()
  try {
    const backdrop = chrome.getByTestId('aurora-backdrop')
    await expect(backdrop).toHaveAttribute('data-hue', '226')
    // WebGL where available; the CSS fallback is equally acceptable.
    await expect(backdrop).toHaveAttribute('data-mode', /webgl|css/)

    await chrome.getByTestId('space-add').click()
    await chrome.getByTestId('space-name-input').fill('Forest')
    await chrome.getByTestId('space-hue-152').click()
    await chrome.getByTestId('space-save').click()

    await expect(backdrop).toHaveAttribute('data-hue', '152')
  } finally {
    await app.close()
  }
})

test('prefers-reduced-motion renders a static aurora', async () => {
  const { app, chrome } = await launchAurora(undefined, {
    env: { AURORA_FORCE_REDUCED_MOTION: '1' },
  })
  try {
    const backdrop = chrome.getByTestId('aurora-backdrop')
    await expect(backdrop).toBeAttached()
    await expect(backdrop).toHaveAttribute('data-animating', 'false')
  } finally {
    await app.close()
  }
})
