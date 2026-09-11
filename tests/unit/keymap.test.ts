import { describe, expect, it } from 'vitest'
import { KEYMAP, RENDERER_COMBO_KEYS } from '../../src/main/services/shortcuts'

describe('keymap', () => {
  it('has unique command ids', () => {
    const ids = KEYMAP.map((k) => k.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has unique accelerators', () => {
    const accels = KEYMAP.map((k) => k.accelerator)
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
    for (const command of Object.values(RENDERER_COMBO_KEYS)) {
      expect(rendererCommands.has(command)).toBe(true)
    }
    expect(Object.keys(RENDERER_COMBO_KEYS).sort()).toEqual(['l', 's', 't'])
  })
})
