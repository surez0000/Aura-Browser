import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useTabs, selectActiveTab } from '@/state/tabs'

/**
 * Page-load progress for the active tab, drawn in the gap above the page card
 * (chrome cannot paint over the native view — ADR-0003). Chromium exposes no
 * percentage, so it advances by stage: started → 40 %, DOM ready → 85 %,
 * finished → 100 % and fades. Visible even with the sidebar hidden.
 */
export function LoadingBar({ top }: { top: number }): React.JSX.Element {
  const active = useTabs(selectActiveTab)
  const loading = !!active?.isLoading && !active.crashed
  const domReady = !!active?.domReady

  // Track the loading edge during render (no effect): true → false shows the
  // 100 % sweep before the bar leaves.
  const [phase, setPhase] = useState<'idle' | 'loading' | 'done'>(loading ? 'loading' : 'idle')
  const [seen, setSeen] = useState(loading)
  if (loading !== seen) {
    setSeen(loading)
    setPhase(loading ? 'loading' : phase === 'loading' ? 'done' : 'idle')
  }

  const target = phase === 'done' ? 1 : domReady ? 0.85 : 0.4

  return (
    <AnimatePresence>
      {phase !== 'idle' && (
        <motion.div
          key="bar"
          className="pointer-events-none absolute inset-x-2 z-20 h-[2px] overflow-hidden rounded-full"
          style={{ top }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
          data-testid="loading-bar"
          data-phase={phase}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(target * 100)}
        >
          <motion.div
            className="h-full w-full rounded-full"
            style={{ background: 'var(--accent)', transformOrigin: 'left center' }}
            initial={{ scaleX: 0.02 }}
            animate={{ scaleX: target }}
            transition={{
              type: 'tween',
              ease: 'easeOut',
              duration: phase === 'done' ? 0.2 : domReady ? 0.8 : 1.6,
            }}
            onAnimationComplete={() => {
              if (phase === 'done') setPhase('idle')
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
