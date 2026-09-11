import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import App from './App'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('missing #root')

// No StrictMode: its double-invoked effects would double IPC side effects
// (overlay attach/detach, bounds pushes) against the main process.
createRoot(root).render(
  <MotionConfig reducedMotion="user">
    <App />
  </MotionConfig>,
)
