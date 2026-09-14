/**
 * WCAG 2.1 color math — the foundation of Aura Browser's contrast guarantee.
 * Pure and dependency-free so CI can sweep every hue (see aurora-aa.test.ts).
 */

export interface Rgba {
  r: number // 0-255
  g: number
  b: number
  a: number // 0-1
}

export function rgba(r: number, g: number, b: number, a = 1): Rgba {
  return { r, g, b, a }
}

export function parseHex(hex: string): Rgba {
  const value = hex.replace('#', '')
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value
  const num = parseInt(full.slice(0, 6), 16)
  const alpha = full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255, a: alpha }
}

export function toCss(c: Rgba): string {
  const r = Math.round(c.r)
  const g = Math.round(c.g)
  const b = Math.round(c.b)
  return c.a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${+c.a.toFixed(3)})`
}

/** hsl (h 0-360, s/l 0-1) -> opaque Rgba. */
export function hslToRgba(h: number, s: number, l: number, a = 1): Rgba {
  const hue = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = l - c / 2
  const [rp, gp, bp] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x]
  return { r: (rp + m) * 255, g: (gp + m) * 255, b: (bp + m) * 255, a }
}

function linearize(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** WCAG relative luminance of an OPAQUE color (alpha ignored). */
export function relativeLuminance(c: Rgba): number {
  return 0.2126 * linearize(c.r) + 0.7152 * linearize(c.g) + 0.0722 * linearize(c.b)
}

/** Alpha-composite src over an opaque dst; result is opaque. */
export function compositeOver(src: Rgba, dst: Rgba): Rgba {
  const a = src.a
  return {
    r: src.r * a + dst.r * (1 - a),
    g: src.g * a + dst.g * (1 - a),
    b: src.b * a + dst.b * (1 - a),
    a: 1,
  }
}

/** WCAG contrast ratio between two OPAQUE colors (composite first if not). */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

const BLACK = rgba(10, 12, 20)
const WHITE = rgba(255, 255, 255)

/** Ink to draw ON an accent-colored surface: whichever of dark/white wins. */
export function onAccentInk(accent: Rgba): Rgba {
  return contrastRatio(BLACK, accent) >= contrastRatio(WHITE, accent) ? BLACK : WHITE
}

/**
 * Adjust a color's HSL lightness until its relative luminance lands within
 * [min, max]. Binary search — monotonic in lightness.
 */
export function clampLuminance(
  h: number,
  s: number,
  targetLum: number,
  band: { min: number; max: number },
): Rgba {
  const wanted = Math.min(band.max, Math.max(band.min, targetLum))
  let lo = 0
  let hi = 1
  let color = hslToRgba(h, s, 0.5)
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2
    color = hslToRgba(h, s, mid)
    const lum = relativeLuminance(color)
    if (Math.abs(lum - wanted) < 0.0005) break
    if (lum < wanted) lo = mid
    else hi = mid
  }
  return color
}
