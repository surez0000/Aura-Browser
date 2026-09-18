import type { ThemeName } from '@shared/theme'
import { toCss } from './contrast'
import { SHARED_TOKENS, THEMES } from './tokens'

/**
 * Runtime theming: tokens.ts is the single source; this module injects it as
 * CSS custom properties and tracks the effective theme. The OS/system setting
 * flows through Electron's nativeTheme (main sets themeSource from settings),
 * which drives `prefers-color-scheme` in this renderer — one pipe for
 * light/dark/system.
 */

export function effectiveTheme(): ThemeName {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark'
}

export function applyThemeVars(theme: ThemeName): void {
  const root = document.documentElement
  root.dataset.theme = theme
  const t = THEMES[theme]
  const vars: Record<string, string> = {
    ...SHARED_TOKENS,
    '--bg-base': toCss(t.bgBase),
    '--card-bg': toCss(t.cardBg),
    '--ink-1': toCss(t.ink1),
    '--ink-2': toCss(t.ink2),
    '--ink-3': toCss(t.ink3),
    '--surface-glass': toCss(t.surfaceGlass),
    '--surface-glass-strong': toCss(t.surfaceGlassStrong),
    '--surface-selected': toCss(t.surfaceSelected),
    '--surface-hover': toCss(t.surfaceHover),
    '--border-glass': toCss(t.borderGlass),
    '--danger': toCss(t.danger),
    '--scrim': toCss(t.scrim),
    '--card-shadow': t.cardShadow,
  }
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value)
  }
}

/**
 * Apply the current theme synchronously (call before first render) and follow
 * changes. Returns an unsubscribe.
 */
export function initTheme(onChange: (theme: ThemeName) => void): () => void {
  applyThemeVars(effectiveTheme())
  const media = window.matchMedia('(prefers-color-scheme: light)')
  const listener = (): void => {
    const theme = effectiveTheme()
    applyThemeVars(theme)
    onChange(theme)
  }
  media.addEventListener('change', listener)
  return () => media.removeEventListener('change', listener)
}
