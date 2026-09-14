import { describe, expect, it } from 'vitest'
import {
  clampLuminance,
  compositeOver,
  contrastRatio,
  hslToRgba,
  onAccentInk,
  parseHex,
  relativeLuminance,
  rgba,
  toCss,
} from '@/theme/contrast'

describe('color parsing and formatting', () => {
  it('parses hex colors', () => {
    expect(parseHex('#ffffff')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
    expect(parseHex('#000')).toEqual({ r: 0, g: 0, b: 0, a: 1 })
    expect(parseHex('#0c0e1a').r).toBe(12)
  })

  it('formats css strings', () => {
    expect(toCss(rgba(255, 0, 0))).toBe('rgb(255, 0, 0)')
    expect(toCss(rgba(255, 255, 255, 0.5))).toBe('rgba(255, 255, 255, 0.5)')
  })

  it('converts HSL', () => {
    expect(toCss(hslToRgba(0, 1, 0.5))).toBe('rgb(255, 0, 0)')
    expect(toCss(hslToRgba(120, 1, 0.5))).toBe('rgb(0, 255, 0)')
    expect(toCss(hslToRgba(240, 1, 0.25))).toBe('rgb(0, 0, 128)')
  })
})

describe('WCAG math', () => {
  it('computes canonical luminances', () => {
    expect(relativeLuminance(rgba(255, 255, 255))).toBeCloseTo(1, 5)
    expect(relativeLuminance(rgba(0, 0, 0))).toBeCloseTo(0, 5)
  })

  it('black on white is 21:1', () => {
    expect(contrastRatio(rgba(0, 0, 0), rgba(255, 255, 255))).toBeCloseTo(21, 1)
  })

  it('composites translucent colors over opaque grounds', () => {
    const half = compositeOver(rgba(255, 255, 255, 0.5), rgba(0, 0, 0))
    expect(half.r).toBeCloseTo(127.5, 1)
    expect(half.a).toBe(1)
  })

  it('picks a readable ink for any accent', () => {
    for (let hue = 0; hue < 360; hue += 10) {
      for (const l of [0.2, 0.4, 0.6, 0.8]) {
        const accent = hslToRgba(hue, 0.8, l)
        const ink = onAccentInk(accent)
        expect(contrastRatio(ink, accent)).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('clampLuminance lands inside the band for every hue', () => {
    for (let hue = 0; hue < 360; hue += 5) {
      const c = clampLuminance(hue, 0.55, 0.08, { min: 0.03, max: 0.1 })
      const lum = relativeLuminance(c)
      expect(lum).toBeGreaterThanOrEqual(0.028)
      expect(lum).toBeLessThanOrEqual(0.102)
    }
  })
})
