import { describe, expect, it } from 'vitest'
import type { ThemeName } from '@shared/theme'
import { auroraPalette } from '@/theme/aurora'
import { STICKY_COLORS, stickyContrast } from '@/theme/sticky'
import { compositeOver, contrastRatio, relativeLuminance, type Rgba } from '@/theme/contrast'
import { AURORA_BANDS, THEMES } from '@/theme/tokens'

/**
 * The WCAG AA guarantee, enforced in CI:
 * for EVERY space hue (sweep 0..345 step 15), both themes, normal + incognito:
 *  - every color the aurora mesh can produce stays inside the theme's
 *    luminance band (the shader only mixes between base and blob colors, so
 *    any pixel is a convex combination — bounded by the band edges);
 *  - all three inks stay above threshold over every glass surface composited
 *    on the worst-case mesh color;
 *  - the accent ink reads on the accent, and the accent reads on the ground.
 */

const HUES = Array.from({ length: 24 }, (_, i) => i * 15)
const THEME_NAMES: ThemeName[] = ['dark', 'light']

function meshExtremes(hue: number, theme: ThemeName, muted: boolean): Rgba[] {
  const palette = auroraPalette(hue, theme, { muted })
  return [palette.base, ...palette.blobs]
}

describe('aurora luminance bands', () => {
  it('every mesh color of every hue stays inside its band', () => {
    for (const theme of THEME_NAMES) {
      const bands = AURORA_BANDS[theme]
      for (const hue of HUES) {
        for (const muted of [false, true]) {
          const palette = auroraPalette(hue, theme, { muted })
          const baseLum = relativeLuminance(palette.base)
          expect(baseLum, `${theme} h${hue} base`).toBeGreaterThanOrEqual(bands.baseLum.min - 0.005)
          expect(baseLum, `${theme} h${hue} base`).toBeLessThanOrEqual(bands.baseLum.max + 0.005)
          for (const blob of palette.blobs) {
            const lum = relativeLuminance(blob)
            expect(lum, `${theme} h${hue} blob`).toBeGreaterThanOrEqual(bands.blobLum.min - 0.005)
            expect(lum, `${theme} h${hue} blob`).toBeLessThanOrEqual(bands.blobLum.max + 0.005)
          }
        }
      }
    }
  })
})

describe('ink contrast over glass on the aurora (AA)', () => {
  /**
   * Usage contract (components follow it; this test enforces it):
   *  - ink-1 (primary text) may sit on ANY surface       -> >= 4.5
   *  - ink-2 (secondary)   sits on bare/glass/hover only -> >= 4.5
   *    (strong glass — active items, filled buttons — always hosts ink-1)
   *  - ink-3 (tertiary/hints, large or non-essential)    -> >= 3.0 anywhere
   */
  it('inks clear their thresholds over every allowed surface x mesh extreme', () => {
    for (const theme of THEME_NAMES) {
      const t = THEMES[theme]
      const surfaces = [
        { name: 'bare', color: null, ink2: true },
        { name: 'glass', color: t.surfaceGlass, ink2: true },
        { name: 'glass-strong', color: t.surfaceGlassStrong, ink2: false },
        { name: 'selected', color: t.surfaceSelected, ink2: false },
        { name: 'hover', color: t.surfaceHover, ink2: true },
      ]
      for (const hue of HUES) {
        for (const muted of [false, true]) {
          for (const mesh of meshExtremes(hue, theme, muted)) {
            for (const surface of surfaces) {
              const ground = surface.color ? compositeOver(surface.color, mesh) : mesh
              const label = `${theme} h${hue}${muted ? ' muted' : ''} ${surface.name}`
              const ink1 = compositeOver(t.ink1, ground)
              const ink3 = compositeOver(t.ink3, ground)
              expect(contrastRatio(ink1, ground), `${label} ink1`).toBeGreaterThanOrEqual(4.5)
              expect(contrastRatio(ink3, ground), `${label} ink3`).toBeGreaterThanOrEqual(3.0)
              if (surface.ink2) {
                const ink2 = compositeOver(t.ink2, ground)
                expect(contrastRatio(ink2, ground), `${label} ink2`).toBeGreaterThanOrEqual(4.5)
              }
            }
          }
        }
      }
    }
  })

  it('inks read on the page card', () => {
    for (const theme of THEME_NAMES) {
      const t = THEMES[theme]
      expect(contrastRatio(compositeOver(t.ink1, t.cardBg), t.cardBg)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(compositeOver(t.ink2, t.cardBg), t.cardBg)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(compositeOver(t.ink3, t.cardBg), t.cardBg)).toBeGreaterThanOrEqual(3.0)
    }
  })

  it('danger text reads on card and glass grounds', () => {
    for (const theme of THEME_NAMES) {
      const t = THEMES[theme]
      expect(contrastRatio(t.danger, t.cardBg), `${theme} danger/card`).toBeGreaterThanOrEqual(4.5)
      const glassOnBase = compositeOver(t.surfaceGlass, t.bgBase)
      expect(contrastRatio(t.danger, glassOnBase), `${theme} danger/glass`).toBeGreaterThanOrEqual(
        3.0,
      )
    }
  })
})

describe('selected surface', () => {
  /**
   * A chosen segment has to be visible as well as legible. Built from the
   * glass tokens it was white-on-white in the light theme: a ratio of exactly
   * 1.00 against the card behind it, so nothing looked selected at all.
   */
  it('reads as a distinct ground against the card it sits on', () => {
    for (const theme of THEME_NAMES) {
      const t = THEMES[theme]
      const selected = compositeOver(t.surfaceSelected, t.cardBg)
      expect(contrastRatio(selected, t.cardBg), `${theme} selected vs card`).toBeGreaterThan(1.1)
    }
  })
})

describe('accent contrast', () => {
  it('accent ink >= 4.5 on accent; accent >= 3.0 on the ground (all hues)', () => {
    for (const theme of THEME_NAMES) {
      for (const hue of HUES) {
        for (const muted of [false, true]) {
          const { accent, accentInk } = auroraPalette(hue, theme, { muted })
          expect(
            contrastRatio(accentInk, accent),
            `${theme} h${hue}${muted ? ' muted' : ''} accent ink`,
          ).toBeGreaterThanOrEqual(4.5)
          expect(
            contrastRatio(accent, THEMES[theme].bgBase),
            `${theme} h${hue}${muted ? ' muted' : ''} accent/ground`,
          ).toBeGreaterThanOrEqual(3.0)
        }
      }
    }
  })
})

describe('sticky note colours', () => {
  it('every colour is legible in both themes', () => {
    for (const theme of THEME_NAMES) {
      for (const color of STICKY_COLORS) {
        expect(stickyContrast(color, theme), `${theme} ${color}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})
