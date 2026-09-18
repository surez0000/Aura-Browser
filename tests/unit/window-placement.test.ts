import { describe, expect, it } from 'vitest'
import { clampToWorkArea, type WindowPlacement } from '../../src/main/windows/chrome-window'

const LAPTOP = { x: 0, y: 38, width: 1512, height: 944 }
const EXTERNAL = { x: 1512, y: 0, width: 2560, height: 1415 }

function placement(patch: Partial<WindowPlacement> = {}): WindowPlacement {
  return { x: 100, y: 100, width: 1000, height: 700, maximized: false, fullScreen: false, ...patch }
}

describe('clampToWorkArea', () => {
  it('leaves a placement that already sits on a display alone', () => {
    expect(clampToWorkArea(placement(), [LAPTOP])).toEqual(placement())
  })

  it('pulls a window dragged above the menu bar back into view, keeping its size', () => {
    // Real case: the title strip can be dragged past the top of the screen, so
    // the saved y is negative. The size is still what the user chose.
    const result = clampToWorkArea(placement({ y: -31 }), [LAPTOP])
    expect(result.y).toBe(LAPTOP.y)
    expect(result.width).toBe(1000)
    expect(result.height).toBe(700)
  })

  it('brings back a window left on a monitor that is no longer connected', () => {
    const onExternal = placement({ x: 2000, y: 200 })
    const result = clampToWorkArea(onExternal, [LAPTOP])
    expect(result.x).toBe(LAPTOP.x + LAPTOP.width - 1000)
    expect(result.y).toBe(200)
  })

  it('keeps a window on the display holding most of it', () => {
    const result = clampToWorkArea(placement({ x: 2000, y: 200 }), [LAPTOP, EXTERNAL])
    expect(result.x).toBe(2000)
    expect(result.y).toBe(200)
  })

  it('shrinks a window that is larger than the display it lands on', () => {
    const result = clampToWorkArea(placement({ width: 4000, height: 3000 }), [LAPTOP])
    expect(result.width).toBe(LAPTOP.width)
    expect(result.height).toBe(LAPTOP.height)
    expect(result.x).toBe(LAPTOP.x)
    expect(result.y).toBe(LAPTOP.y)
  })

  it('passes through a placement that never recorded a position', () => {
    const noPosition = { width: 900, height: 600, maximized: false, fullScreen: false }
    expect(clampToWorkArea(noPosition, [LAPTOP])).toEqual(noPosition)
  })
})
