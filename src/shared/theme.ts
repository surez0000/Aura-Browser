/** Theme mode setting: 'system' follows the OS (via Electron nativeTheme). */
export type ThemeMode = 'system' | 'light' | 'dark'

export type ThemeName = 'light' | 'dark'

/** Window ground colors (main process paints these behind the renderer). */
export const WINDOW_BG: Record<ThemeName, string> = {
  dark: '#0c0e1a',
  light: '#e9ecf6',
}
