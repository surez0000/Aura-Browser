import type { ThemeName } from '@shared/theme'
import {
  clampLuminance,
  contrastRatio,
  hslToRgba,
  onAccentInk,
  relativeLuminance,
  toCss,
  type Rgba,
} from './contrast'
import { AURORA_BANDS, THEMES } from './tokens'

/**
 * Every Space owns one hue; everything else — the four mesh colors, the base
 * ground, the accent, and the ink that sits on the accent — derives from it,
 * clamped into the theme's luminance bands so contrast stays provable.
 */

export interface AuroraPalette {
  base: Rgba
  blobs: [Rgba, Rgba, Rgba, Rgba]
  accent: Rgba
  accentInk: Rgba
}

/** Hue offsets for the mesh: analogous pair, counter, complement. */
const BLOB_HUE_OFFSETS = [0, 34, 300, 168] as const

export function auroraPalette(
  hue: number,
  theme: ThemeName,
  opts: { muted?: boolean } = {},
): AuroraPalette {
  const bands = AURORA_BANDS[theme]
  const satScale = opts.muted ? 0.25 : 1

  const base = clampLuminance(hue, bands.baseSat * satScale, bands.baseTarget, bands.baseLum)
  const blobs = BLOB_HUE_OFFSETS.map((offset, i) =>
    clampLuminance(
      hue + offset,
      bands.blobSat * satScale,
      bands.blobTargets[i] ?? bands.blobTargets[0],
      bands.blobLum,
    ),
  ) as [Rgba, Rgba, Rgba, Rgba]

  const accent = accentRgba(hue, theme, opts.muted ?? false)
  return { base, blobs, accent, accentInk: onAccentInk(accent) }
}

/**
 * Accent: vivid on dark, deep on light; clamped so it reads as UI color
 * against the theme ground at >= 3:1 (WCAG non-text contrast).
 */
function accentRgba(hue: number, theme: ThemeName, muted: boolean): Rgba {
  const sat = (theme === 'dark' ? 0.85 : 0.62) * (muted ? 0.3 : 1)
  const band = theme === 'dark' ? { min: 0.25, max: 0.55 } : { min: 0.06, max: 0.16 }
  const target = theme === 'dark' ? 0.38 : 0.1
  let accent = clampLuminance(hue, sat, target, band)
  // Nudge toward the band edge until the ground contrast clears 3:1.
  const ground = THEMES[theme].bgBase
  for (let i = 0; i < 6 && contrastRatio(accent, ground) < 3; i++) {
    const lum = relativeLuminance(accent)
    const next = theme === 'dark' ? lum + 0.05 : Math.max(0.02, lum - 0.02)
    accent = clampLuminance(hue, sat, next, { min: 0.02, max: 0.7 })
  }
  return accent
}

/** CSS accent color for a space (dots, highlights, badges). */
export function accentColor(
  space: { accentHue: number; incognito: boolean },
  theme: ThemeName,
): string {
  return toCss(auroraPalette(space.accentHue, theme, { muted: space.incognito }).accent)
}

/** CSS fallback gradient (used when WebGL is unavailable). */
export function cssFallbackGradient(palette: AuroraPalette): string {
  const [a, b, c, d] = palette.blobs
  return [
    `radial-gradient(1100px 750px at 12% -8%, ${toCss({ ...a, a: 0.85 })}, transparent 62%)`,
    `radial-gradient(1000px 700px at 108% 18%, ${toCss({ ...c, a: 0.8 })}, transparent 58%)`,
    `radial-gradient(950px 900px at 38% 118%, ${toCss({ ...b, a: 0.8 })}, transparent 60%)`,
    `radial-gradient(800px 800px at 80% 90%, ${toCss({ ...d, a: 0.7 })}, transparent 55%)`,
    toCss(palette.base),
  ].join(', ')
}

export function paletteVec3(c: Rgba): [number, number, number] {
  return [c.r / 255, c.g / 255, c.b / 255]
}

export function hueOf(space: { accentHue: number } | null | undefined): number {
  return space?.accentHue ?? 226
}

// hslToRgba re-exported for the SpaceEditor's decorative swatches.
export { hslToRgba }
