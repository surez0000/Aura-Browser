import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { DownloadBubbleState } from '@shared/models'
import { invoke, on } from '@/lib/ipc'
import { DownloadPopover } from '@/components/DownloadNotice'
import { auroraPalette, hue2Of, hueOf } from '@/theme/aurora'
import { toCss } from '@/theme/contrast'
import { useUi } from '@/state/ui'

/** Room around the card for its shadow; main sizes the view to match. */
const MARGIN = 14

/**
 * The download popover's own renderer: the same bundle as the chrome, loaded
 * with a #download-bubble hash into a small transparent view that floats
 * beside the Downloads button. It draws the card, tells main how tall it is,
 * and reports the pointer so a popover being read is never pulled away.
 */
export default function DownloadBubbleApp(): React.JSX.Element {
  const theme = useUi((s) => s.themeName)
  const [state, setState] = useState<DownloadBubbleState | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)

  // Subscribe *and* fetch: the first push can land before this listens.
  useEffect(() => {
    const off = on('downloadBubble:state', setState)
    void invoke('downloadBubble:get', {}).then((current) => {
      if (current) setState((prev) => prev ?? current)
    })
    return off
  }, [])

  const hasCard = state !== null && state.items.length > 0
  useLayoutEffect(() => {
    const el = cardRef.current
    if (!el) return
    const send = (): void => void invoke('downloadBubble:resize', { height: el.offsetHeight })
    const observer = new ResizeObserver(send)
    observer.observe(el)
    send()
    return () => observer.disconnect()
  }, [hasCard])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') void invoke('downloadBubble:dismiss', {})
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const space = state?.space ?? null
  const palette = useMemo(
    () =>
      auroraPalette(hueOf(space), theme, { muted: space?.incognito ?? false, hue2: hue2Of(space) }),
    [space, theme],
  )
  const style = {
    '--accent': toCss(palette.accent),
    '--accent-ink': toCss(palette.accentInk),
    padding: MARGIN,
  } as CSSProperties

  return (
    <div style={style}>
      <AnimatePresence>
        {hasCard && (
          <motion.div
            ref={cardRef}
            key="card"
            initial={{
              y: state.placement === 'above' ? 8 : 0,
              x: state.placement === 'beside' ? -8 : 0,
              scale: 0.97,
            }}
            animate={{ y: 0, x: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 520, damping: 34 }}
          >
            <DownloadPopover state={state} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
