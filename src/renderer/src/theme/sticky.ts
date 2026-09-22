import type { ThemeName } from '@shared/theme'
import { clampLuminance, contrastRatio, onAccentInk, toCss, type Rgba } from './contrast'
import { THEMES } from './tokens'

/**
 * Sticky note colours.
 *
 * A paper sticky is found by its colour before it is read, which is the whole
 * reason the metaphor works — so the colour has to be strong enough to scan and
 * still leave the writing legible. Rather than guess hex values per theme, each
 * colour is one hue run through the same luminance clamp that proves the aurora
 * palette: pale in the light theme, deep in the dark one, with the ink chosen
 * by measured contrast. `aurora-aa.test.ts` sweeps every colour in both themes.
 */
import { STICKY_COLORS, type StickyColor } from '@shared/sticky'

export { STICKY_COLORS }
export type { StickyColor }

const HUES: Record<Exclude<StickyColor, 'default'>, number> = {
  amber: 44,
  rose: 348,
  violet: 278,
  sky: 205,
  mint: 155,
  clay: 18,
}

/** Names for the colour picker; "default" is the theme's own surface. */
export const STICKY_LABELS: Record<StickyColor, string> = {
  default: 'Plain',
  amber: 'Amber',
  rose: 'Rose',
  violet: 'Violet',
  sky: 'Sky',
  mint: 'Mint',
  clay: 'Clay',
}

/** Pale enough to write on in the light theme, deep enough to read in the dark. */
const BAND = {
  light: { min: 0.6, max: 0.86, target: 0.74, sat: 0.62 },
  dark: { min: 0.035, max: 0.11, target: 0.075, sat: 0.42 },
} as const

export interface StickySkin {
  /** Card ground. */
  background: string
  /** Text on that ground, chosen by contrast rather than by eye. */
  ink: string
  /** Secondary text — the same ink, stepped back. */
  inkSoft: string
  border: string
}

function paper(color: Exclude<StickyColor, 'default'>, theme: ThemeName): Rgba {
  const band = BAND[theme]
  return clampLuminance(HUES[color], band.sat, band.target, { min: band.min, max: band.max })
}

export function stickySkin(color: StickyColor, theme: ThemeName): StickySkin {
  if (color === 'default') {
    const t = THEMES[theme]
    return {
      background: toCss(t.surfaceGlassStrong),
      ink: toCss(t.ink1),
      inkSoft: toCss(t.ink3),
      border: toCss(t.borderGlass),
    }
  }
  const bg = paper(color, theme)
  const ink = onAccentInk(bg)
  return {
    background: toCss(bg),
    ink: toCss(ink),
    inkSoft: toCss({ ...ink, a: 0.62 }),
    border: toCss({ ...ink, a: 0.14 }),
  }
}

/** The swatch in the picker: the paper itself, at full strength. */
export function stickySwatch(color: StickyColor, theme: ThemeName): string {
  return stickySkin(color, theme).background
}

/** Exposed for the contrast sweep. */
export function stickyContrast(color: StickyColor, theme: ThemeName): number {
  if (color === 'default') {
    const t = THEMES[theme]
    return contrastRatio(t.ink1, t.bgBase)
  }
  const bg = paper(color, theme)
  return contrastRatio(onAccentInk(bg), bg)
}

/**
 * What makes paper read as paper rather than a coloured rectangle: a fine
 * grain, a glue strip along the top edge, and a shadow that lifts the sheet
 * off the wall. The grain is one tiny SVG noise tile laid over the colour with
 * soft-light blending, so it darkens pale paper and lightens deep paper alike.
 */
export const PAPER_GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0.9 0'/></filter><rect width='160' height='160' filter='url(%23g)'/></svg>\")"

export const PAPER_SHADOW: Record<ThemeName, string> = {
  light: '0 1px 2px rgba(20,14,8,0.10), 0 6px 14px -4px rgba(20,14,8,0.22)',
  dark: '0 1px 2px rgba(0,0,0,0.35), 0 8px 18px -6px rgba(0,0,0,0.6)',
}

export const PAPER_SHADOW_LIFTED: Record<ThemeName, string> = {
  light: '0 2px 3px rgba(20,14,8,0.12), 0 14px 28px -8px rgba(20,14,8,0.30)',
  dark: '0 2px 3px rgba(0,0,0,0.4), 0 16px 32px -8px rgba(0,0,0,0.7)',
}

/**
 * A wall of stickies is never perfectly square. Each sheet leans a hair, the
 * same way every time for the same note, so the board does not fidget on
 * every reload. Under a degree: enough to read as paper, not enough to look
 * like a mess.
 */
export function stickyTilt(id: number): number {
  return (((id * 7919) % 5) - 2) * 0.4
}
