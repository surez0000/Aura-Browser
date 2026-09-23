import type { ThemeName } from '@shared/theme'
import { STICKY_COLORS, type StickyColor } from '@shared/sticky'
import {
  clampLuminance,
  compositeOver,
  contrastRatio,
  onAccentInk,
  toCss,
  type Rgba,
} from './contrast'

/**
 * Sticky note paper.
 *
 * Paper is pale in both themes, with dark ink — a sticky doesn't turn black
 * when the lights go down, and the deep "night" paper this replaced read as
 * coloured glass rather than a note. On a dark board, pale paper is also what
 * makes a sticky jump out, the way it does on a real wall.
 *
 * Each colour is one hue run through the same luminance clamp that proves the
 * aurora palette, with the ink chosen by measured contrast, so none of them is
 * picked by eye. `aurora-aa.test.ts` sweeps every colour and every ink level.
 */
export { STICKY_COLORS }
export type { StickyColor }

const HUES: Record<StickyColor, number> = {
  default: 42,
  amber: 44,
  rose: 348,
  violet: 278,
  sky: 205,
  mint: 155,
  clay: 18,
}

/** Names for the colour picker. "Plain" is cream, like an ordinary notepad. */
export const STICKY_LABELS: Record<StickyColor, string> = {
  default: 'Plain',
  amber: 'Amber',
  rose: 'Rose',
  violet: 'Violet',
  sky: 'Sky',
  mint: 'Mint',
  clay: 'Clay',
}

/** Pale enough to write on, strong enough to find by colour. */
const BAND = { min: 0.6, max: 0.86 } as const
const TINT = { sat: 0.62, target: 0.74 }
/** Plain paper is barely tinted and nearly white — a notepad, not a colour. */
const PLAIN = { sat: 0.3, target: 0.84 }

/** How far each line of writing steps back from full ink. */
export const INK_LEVELS = { title: 1, body: 0.72, meta: 0.64 } as const

export interface StickySkin {
  /** The paper. */
  background: string
  /** Titles — full ink, chosen by contrast rather than by eye. */
  ink: string
  /** The note itself, stepped back a little. */
  inkSoft: string
  /** Time and page, stepped back further. */
  inkMeta: string
  /** Hairlines on the paper: the editor's footer rule, swatch rings. */
  border: string
}

function paper(color: StickyColor): Rgba {
  const { sat, target } = color === 'default' ? PLAIN : TINT
  return clampLuminance(HUES[color], sat, target, BAND)
}

/**
 * The theme no longer changes the paper — only the shadow it casts (see
 * PAPER_SHADOW). It stays in the signature so callers read naturally.
 */
export function stickySkin(color: StickyColor, _theme?: ThemeName): StickySkin {
  const bg = paper(color)
  const ink = onAccentInk(bg)
  return {
    background: toCss(bg),
    ink: toCss({ ...ink, a: INK_LEVELS.title }),
    inkSoft: toCss({ ...ink, a: INK_LEVELS.body }),
    inkMeta: toCss({ ...ink, a: INK_LEVELS.meta }),
    border: toCss({ ...ink, a: 0.12 }),
  }
}

/** Contrast of each ink level on its paper — exposed for the AA sweep. */
export function stickyInkContrast(color: StickyColor): Record<keyof typeof INK_LEVELS, number> {
  const bg = paper(color)
  const ink = onAccentInk(bg)
  const at = (a: number): number => contrastRatio(compositeOver({ ...ink, a }, bg), bg)
  return { title: at(INK_LEVELS.title), body: at(INK_LEVELS.body), meta: at(INK_LEVELS.meta) }
}

/** Relative luminance of the paper — exposed so a test can prove it stays pale. */
export function stickyPaper(color: StickyColor): Rgba {
  return paper(color)
}

/**
 * What makes paper read as paper rather than a coloured rectangle: a grain
 * multiplied into the sheet, a glue strip along the top edge, and a shadow that
 * lifts it off the wall. The grain is one small SVG noise tile.
 */
export const PAPER_GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0.9 0'/></filter><rect width='160' height='160' filter='url(%23g)'/></svg>\")"

/** Pale paper on a dark board needs a deeper, darker shadow than on a light one. */
export const PAPER_SHADOW: Record<ThemeName, string> = {
  light: '0 1px 2px rgba(20,14,8,0.14), 0 14px 28px -12px rgba(40,24,10,0.36)',
  dark: '0 1px 2px rgba(20,14,8,0.18), 0 18px 34px -12px rgba(0,0,0,0.6)',
}

export const PAPER_SHADOW_LIFTED: Record<ThemeName, string> = {
  light: '0 2px 4px rgba(20,14,8,0.16), 0 24px 40px -14px rgba(40,24,10,0.44)',
  dark: '0 2px 4px rgba(20,14,8,0.22), 0 28px 46px -14px rgba(0,0,0,0.72)',
}

/**
 * A wall of stickies is never square. Each sheet leans up to about two degrees,
 * the same way every time for the same note so the board doesn't fidget on
 * reload, and straightens when you reach for it.
 */
export function stickyTilt(id: number): number {
  return (((id * 7919) % 5) - 2) * 1.1
}
