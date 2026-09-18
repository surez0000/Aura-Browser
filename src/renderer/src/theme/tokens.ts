import type { ThemeName } from '@shared/theme'
import { parseHex, rgba, type Rgba } from './contrast'

/**
 * Aura Browser design tokens — single source of truth (TypeScript, not CSS), so the
 * same values feed the runtime (`apply.ts` injects them as CSS custom
 * properties) and the WCAG AA sweep in CI (`tests/unit/aurora-aa.test.ts`).
 */

export interface ThemeTokens {
  bgBase: Rgba
  cardBg: Rgba
  /** Text inks: primary / secondary / tertiary (translucent by design). */
  ink1: Rgba
  ink2: Rgba
  ink3: Rgba
  surfaceGlass: Rgba
  surfaceGlassStrong: Rgba
  surfaceHover: Rgba
  borderGlass: Rgba
  danger: Rgba
  scrim: Rgba
  cardShadow: string
}

export const THEMES: Record<ThemeName, ThemeTokens> = {
  dark: {
    bgBase: parseHex('#0c0e1a'),
    cardBg: parseHex('#10131f'),
    ink1: rgba(255, 255, 255, 0.92),
    ink2: rgba(255, 255, 255, 0.74),
    ink3: rgba(255, 255, 255, 0.54),
    surfaceGlass: rgba(255, 255, 255, 0.06),
    surfaceGlassStrong: rgba(255, 255, 255, 0.12),
    surfaceHover: rgba(255, 255, 255, 0.09),
    borderGlass: rgba(255, 255, 255, 0.12),
    danger: parseHex('#ff8585'),
    scrim: rgba(5, 7, 14, 0.72),
    cardShadow: '0 12px 40px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.35)',
  },
  light: {
    bgBase: parseHex('#e9ecf6'),
    cardBg: parseHex('#ffffff'),
    ink1: rgba(18, 21, 38, 0.92),
    ink2: rgba(18, 21, 38, 0.72),
    ink3: rgba(18, 21, 38, 0.55),
    surfaceGlass: rgba(255, 255, 255, 0.42),
    surfaceGlassStrong: rgba(255, 255, 255, 0.72),
    surfaceHover: rgba(255, 255, 255, 0.58),
    borderGlass: rgba(20, 24, 46, 0.12),
    danger: parseHex('#a52f2f'),
    scrim: rgba(232, 236, 248, 0.72),
    cardShadow: '0 12px 40px rgba(24, 30, 60, 0.18), 0 2px 8px rgba(24, 30, 60, 0.1)',
  },
}

/** Theme-independent structural tokens. */
export const SHARED_TOKENS: Record<string, string> = {
  '--font-ui':
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, 'Helvetica Neue', Arial, sans-serif",
  '--radius-card': '12px',
  '--radius-control': '8px',
  '--radius-pill': '999px',
  '--blur-glass': '24px',
}

/**
 * Aurora mesh constraints per theme. Relative-luminance bands — not HSL
 * lightness — so perceptually bright hues (greens, yellows) are clamped too.
 * The AA sweep proves: any pixel the mesh can produce, composited under every
 * glass surface, keeps all three inks above their WCAG thresholds.
 */
export interface AuroraBands {
  baseLum: { min: number; max: number }
  blobLum: { min: number; max: number }
  blobSat: number
  baseSat: number
  /** Per-blob luminance targets inside the band (depth variation). */
  blobTargets: [number, number, number, number]
  baseTarget: number
}

export const AURORA_BANDS: Record<ThemeName, AuroraBands> = {
  dark: {
    baseLum: { min: 0.01, max: 0.03 },
    blobLum: { min: 0.03, max: 0.08 },
    // Chroma is what makes one Space read as a different colour from another.
    // clampLuminance hits the luminance target whatever the saturation, so
    // raising it changes hue strength without touching any contrast ratio.
    blobSat: 0.95,
    baseSat: 0.82,
    blobTargets: [0.07, 0.055, 0.045, 0.035],
    baseTarget: 0.018,
  },
  light: {
    baseLum: { min: 0.78, max: 0.88 },
    blobLum: { min: 0.52, max: 0.72 },
    blobSat: 0.9,
    baseSat: 0.78,
    blobTargets: [0.6, 0.68, 0.55, 0.64],
    baseTarget: 0.84,
  },
}
