import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/**
 * The OS "reduce motion" preference, read from the exact media query the
 * reduced-motion audit asserts on. Components gate their own transitions with
 * this (Motion's built-in hook reads a differently phrased query and captures
 * it at first render, which proved unreliable on some Windows setups).
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  )
  useEffect(() => {
    const media = window.matchMedia(QUERY)
    const listener = (): void => setReduced(media.matches)
    media.addEventListener('change', listener)
    listener()
    return () => media.removeEventListener('change', listener)
  }, [])
  return reduced
}
