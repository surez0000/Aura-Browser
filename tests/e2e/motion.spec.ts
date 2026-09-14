import { expect, test } from '@playwright/test'
import { launchAurora, modifierKey } from './helpers'

/**
 * Motion audit — the two halves of the phase (c) exit criteria:
 *  - reduced motion: springs collapse to a single frame (the aurora's
 *    still-frame behavior is covered in theme.spec.ts);
 *  - frame-time probe: with motion on, the sidebar spring and a Space switch
 *    run across many frames with no long-frame stalls. The measured numbers
 *    are attached to the report, so a slow runner is visible without failing.
 */

type Page = import('playwright').Page

/** The panel slides off-screen (transform), so its right edge tells the story. */
const SIDEBAR_RIGHT = `document.querySelector('[data-testid="sidebar"]').getBoundingClientRect().right`

function rightEdgeAfterFrames(chrome: Page, frames: number): Promise<number> {
  const nested = Array.from({ length: frames }).reduce<string>(
    (inner) => `requestAnimationFrame(() => ${inner})`,
    `r(${SIDEBAR_RIGHT})`,
  )
  return chrome.evaluate(`new Promise((r) => ${nested})`)
}

test('reduced motion: the sidebar collapse completes within a frame', async () => {
  const { app, chrome } = await launchAurora(undefined, {
    env: { AURORA_FORCE_REDUCED_MOTION: '1' },
  })
  try {
    expect(await chrome.evaluate(`matchMedia('(prefers-reduced-motion: reduce)').matches`)).toBe(
      true,
    )
    expect(await chrome.evaluate(SIDEBAR_RIGHT)).toBeGreaterThan(200)

    await chrome.keyboard.press(`${modifierKey()}+s`)
    expect(await rightEdgeAfterFrames(chrome, 3)).toBeLessThanOrEqual(0)
    await chrome.keyboard.press(`${modifierKey()}+s`)
    expect(await rightEdgeAfterFrames(chrome, 3)).toBeGreaterThan(200)
  } finally {
    await app.close()
  }
})

test('frame-time probe: sidebar spring and Space switch run without long frames', async () => {
  const { app, chrome } = await launchAurora()
  try {
    // Control: with motion on, the spring is still mid-flight one frame in.
    await chrome.keyboard.press(`${modifierKey()}+s`)
    expect(await rightEdgeAfterFrames(chrome, 1)).toBeGreaterThan(0)
    await expect
      .poll(() => chrome.evaluate(SIDEBAR_RIGHT), { timeout: 5_000 })
      .toBeLessThanOrEqual(0)

    // Sample requestAnimationFrame timestamps across the interactions.
    await chrome.evaluate(
      `window.__frames = []; (function loop(t) { window.__frames.push(t); window.__frameRaf = requestAnimationFrame(loop) })(performance.now())`,
    )
    await chrome.keyboard.press(`${modifierKey()}+s`) // back to fixed: slide in
    await chrome.waitForTimeout(500)
    await chrome.getByTestId('space-add').click()
    await chrome.getByTestId('space-name-input').fill('Probe')
    await chrome.getByTestId('space-save').click() // Space switch: column slide-in
    await chrome.waitForTimeout(500)
    await chrome.getByTestId('space-dot').nth(0).click()
    await chrome.waitForTimeout(500)

    const deltas: number[] = await chrome.evaluate(
      `(() => { cancelAnimationFrame(window.__frameRaf); const f = window.__frames; return f.slice(1).map((t, i) => t - f[i]) })()`,
    )
    deltas.sort((a, b) => a - b)
    const at = (p: number): number =>
      deltas[Math.min(deltas.length - 1, Math.floor(p * deltas.length))] ?? 0
    const stats = {
      frames: deltas.length,
      medianMs: +at(0.5).toFixed(1),
      p95Ms: +at(0.95).toFixed(1),
      maxMs: +at(1).toFixed(1),
    }
    test.info().annotations.push({ type: 'frame-times', description: JSON.stringify(stats) })
    console.log('[frame probe]', JSON.stringify(stats))

    // Loose bounds on purpose: CI runners vary. The annotation carries the truth.
    expect(stats.frames).toBeGreaterThan(20)
    expect(stats.medianMs).toBeLessThan(50)
    expect(stats.maxMs).toBeLessThan(500)
  } finally {
    await app.close()
  }
})
