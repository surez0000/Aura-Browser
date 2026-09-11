import { describe, expect, it } from 'vitest'
import { KEYMAP, RENDERER_COMBOS, matchCombo } from '@shared/keymap'

describe('keymap', () => {
  it('has unique command ids', () => {
    const ids = KEYMAP.map((k) => k.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has unique accelerators (where defined)', () => {
    const accels = KEYMAP.map((k) => k.accelerator).filter((a): a is string => !!a)
    expect(new Set(accels).size).toBe(accels.length)
  })

  it('gives every renderer-scope command a renderer command id', () => {
    for (const k of KEYMAP.filter((k) => k.scope === 'renderer')) {
      expect(k.rendererCommand, `${k.id} must map to a renderer command`).toBeTruthy()
    }
  })

  it('keeps the before-input combo table in sync with renderer-scope entries', () => {
    const rendererCommands = new Set(
      KEYMAP.filter((k) => k.scope === 'renderer').map((k) => k.rendererCommand),
    )
    for (const combo of RENDERER_COMBOS) {
      expect(rendererCommands.has(combo.command), `${combo.command} must be renderer scope`).toBe(
        true,
      )
    }
  })

  it('has no duplicate combo (key, shift) pairs', () => {
    const pairs = RENDERER_COMBOS.map((c) => `${c.key}:${c.shift ?? false}`)
    expect(new Set(pairs).size).toBe(pairs.length)
  })

  it('matchCombo resolves keys with and without shift', () => {
    expect(matchCombo('t', false)).toBe('tab:new')
    expect(matchCombo('g', false)).toBe('find:next')
    expect(matchCombo('g', true)).toBe('find:prev')
    expect(matchCombo('t', true)).toBeNull()
    expect(matchCombo('x', false)).toBeNull()
  })
})
