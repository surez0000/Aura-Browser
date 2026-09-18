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

/** Both modes stay in the layout, so the width is what changes: 264 ↔ 60. */
const SIDEBAR_RIGHT = `document.querySelector('[data-testid="sidebar"]').getBoundingClientRect().width`

function rightEdgeAfterFrames(chrome: Page, frames: number): Promise<number> {
  const nested = Array.from({ length: frames }).reduce<string>(
    (inner) => `requestAnimationFrame(() => ${inner})`,
    `r(${SIDEBAR_RIGHT})`,
  )
  return chrome.evaluate(`new Promise((r) => ${nested})`)
}

/** Record the sidebar's right edge every animation frame until stopped. */
const startEdgeSampler = (chrome: Page): Promise<void> =>
  chrome.evaluate(
    `window.__edges = []; (function loop() { window.__edges.push(${SIDEBAR_RIGHT}); window.__edgeRaf = requestAnimationFrame(loop) })()`,
  )
const stopEdgeSampler = (chrome: Page): Promise<number[]> =>
  chrome.evaluate(`(() => { cancelAnimationFrame(window.__edgeRaf); return window.__edges })()`)

test('reduced motion: the sidebar collapse completes within a frame', async () => {
  const { app, chrome } = await launchAurora(undefined, {
    env: { AURORA_FORCE_REDUCED_MOTION: '1' },
  })
  try {
    expect(await chrome.evaluate(`matchMedia('(prefers-reduced-motion: reduce)').matches`)).toBe(
      true,
    )
    const sidebar = chrome.getByTestId('sidebar')
    const edge = (): Promise<number> => chrome.evaluate(SIDEBAR_RIGHT)
    expect(await edge()).toBeGreaterThan(200)

    // Timing-independent check: sample the edge every frame across the toggle.
    // With duration 0 the panel jumps from shown to hidden with no frame in
    // between; a spring would leave a trail of intermediate positions.
    await startEdgeSampler(chrome)
    await chrome.keyboard.press(`${modifierKey()}+s`)
    await expect(sidebar).toHaveAttribute('data-state', 'compact')
    await expect.poll(edge, { timeout: 5_000 }).toBeLessThan(80)
    const hiding = (await stopEdgeSampler(chrome)).filter((e) => e > 80 && e < 260)
    expect(hiding, `intermediate frames while hiding: ${hiding.join(', ')}`).toEqual([])

    await startEdgeSampler(chrome)
    await chrome.keyboard.press(`${modifierKey()}+s`)
    await expect(sidebar).toHaveAttribute('data-state', 'fixed')
    await expect.poll(edge, { timeout: 5_000 }).toBeGreaterThan(200)
    const showing = (await stopEdgeSampler(chrome)).filter((e) => e > 80 && e < 260)
    expect(showing, `intermediate frames while showing: ${showing.join(', ')}`).toEqual([])
  } finally {
    await app.close()
  }
})

test('frame-time probe: sidebar spring and Space switch run without long frames', async () => {
  // Animation-frame timing is only meaningful on real hardware with a visible,
  // focused window; CI runners throttle or pause frames for unfocused windows.
  // The reference numbers live in docs/PHASES.md.
  test.skip(!!process.env.CI, 'frame-time probe runs on reference hardware, not CI')
  const { app, chrome } = await launchAurora()
  try {
    // This test is about motion being ON. CI runners (Windows Server especially)
    // often disable OS animations, which Chromium reports as reduced motion and
    // would rightly collapse the spring — so pin the preference here.
    await chrome.emulateMedia({ reducedMotion: 'no-preference' })
    const reduced: boolean = await chrome.evaluate(
      `matchMedia('(prefers-reduced-motion: reduce)').matches`,
    )
    expect(reduced, 'reduced motion must be off for the probe').toBe(false)

    // Control: with motion on, the spring is still mid-flight one frame in.
    await chrome.keyboard.press(`${modifierKey()}+s`)
    expect(
      await rightEdgeAfterFrames(chrome, 1),
      'sidebar should still be sliding one frame after the toggle',
    ).toBeGreaterThan(80)
    await expect.poll(() => chrome.evaluate(SIDEBAR_RIGHT), { timeout: 5_000 }).toBeLessThan(80)

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
