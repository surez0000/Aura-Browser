import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import App from './App'
import { effectiveTheme, initTheme } from './theme/apply'
import { useUi } from './state/ui'
import './index.css'

// Apply tokens synchronously before first paint; follow nativeTheme changes
// (the main process maps the theme setting onto prefers-color-scheme).
useUi.setState({ themeName: effectiveTheme() })
initTheme((theme) => useUi.getState().setThemeName(theme))

const root = document.getElementById('root')
if (!root) throw new Error('missing #root')

// No StrictMode: its double-invoked effects would double IPC side effects
// (overlay attach/detach, bounds pushes) against the main process.
createRoot(root).render(
  <MotionConfig reducedMotion="user">
    <App />
  </MotionConfig>,
)
