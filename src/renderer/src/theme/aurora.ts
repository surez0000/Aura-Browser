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
 * Every Space owns a gradient: two hues. The four mesh colors walk from the
 * first hue to the second, and the ground sits between them; the accent and
 * the ink on it come from the first. Everything is clamped into the theme's
 * luminance bands, so contrast stays provable whatever gradient is chosen.
 */

export interface AuroraPalette {
  base: Rgba
  blobs: [Rgba, Rgba, Rgba, Rgba]
  accent: Rgba
  accentInk: Rgba
}

/** Where each mesh field sits along the gradient, 0 = first hue, 1 = second. */
const BLOB_STOPS = [0, 0.38, 1, 0.68] as const

/**
 * Default second stop for a Space that predates gradients: far enough round
 * the wheel to read as a gradient, close enough to stay harmonious.
 */
export const DEFAULT_HUE_SPREAD = 52

/** Shortest way round the colour wheel, so 350 → 10 travels 20°, not 340°. */
function mixHue(from: number, to: number, t: number): number {
  const delta = ((((to - from) % 360) + 540) % 360) - 180
  return from + delta * t
}

export function auroraPalette(
  hue: number,
  theme: ThemeName,
  opts: { muted?: boolean; hue2?: number | null } = {},
): AuroraPalette {
  const bands = AURORA_BANDS[theme]
  const satScale = opts.muted ? 0.25 : 1
  const hueB = opts.hue2 ?? hue + DEFAULT_HUE_SPREAD

  const base = clampLuminance(
    mixHue(hue, hueB, 0.5),
    bands.baseSat * satScale,
    bands.baseTarget,
    bands.baseLum,
  )
  const blobs = BLOB_STOPS.map((stop, i) =>
    clampLuminance(
      mixHue(hue, hueB, stop),
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

/** Vivid two-stop swatch, for small controls where the mesh would read as black. */
export function gradientSwatchCss(hue: number, hue2: number, theme: ThemeName): string {
  const a = auroraPalette(hue, theme).accent
  const b = auroraPalette(hue2, theme).accent
  return `linear-gradient(135deg, ${toCss(a)}, ${toCss(b)})`
}

/** Two-stop swatch for a Space's gradient (dots, previews). */
export function spaceGradientCss(
  space: { accentHue: number; accentHue2?: number | null; incognito: boolean },
  theme: ThemeName,
): string {
  const palette = auroraPalette(space.accentHue, theme, {
    muted: space.incognito,
    hue2: space.accentHue2 ?? null,
  })
  const [first, , last] = palette.blobs
  return `linear-gradient(135deg, ${toCss(first)}, ${toCss(last)})`
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

/** Second gradient stop of a Space, or the default spread from the first. */
export function hue2Of(
  space: { accentHue: number; accentHue2?: number | null } | null | undefined,
): number {
  return space?.accentHue2 ?? hueOf(space) + DEFAULT_HUE_SPREAD
}

// hslToRgba re-exported for the SpaceEditor's decorative swatches.
export { hslToRgba }
