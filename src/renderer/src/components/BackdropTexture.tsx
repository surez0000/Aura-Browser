import { useEffect, useRef } from 'react'
import type { BackdropTexture as TextureName } from '@shared/models'
import type { ThemeName } from '@shared/theme'
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion'

/**
 * An optional texture over the Space gradient, chosen in Settings.
 *
 * 'grain' is a fine static noise in the spirit of Arc: one SVG turbulence
 * tile, no animation and no per-frame cost. 'particles' is a slow drifting
 * dot field with links between near neighbours, tuned to stay in the
 * background rather than pull the eye. Both sit above the aurora canvas and
 * below everything else, and neither ever takes a pointer event.
 */

/** A single turbulence tile, repeated. Cheap enough to inline. */
const GRAIN_URL =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")"

/** particles.js semantics: the count follows the area, so density holds. */
const PARTICLE_BASE = 80
const PARTICLE_AREA = 800
const MAX_PARTICLES = 90
const LINK_DISTANCE = 150
const SPEED = 0.4
const FRAME_INTERVAL_MS = 33

interface Dot {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  a: number
}

function makeDots(width: number, height: number, count: number): Dot[] {
  return Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: Math.cos(angle) * SPEED,
      vy: Math.sin(angle) * SPEED,
      r: 1 + Math.random() * 2,
      a: 0.15 + Math.random() * 0.35,
    }
  })
}

function ParticleField({ theme }: { theme: ThemeName }): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // White reads as light dust on a dark ground; on a light ground it
    // disappears, so the ink side of the theme is used instead.
    const ink = theme === 'dark' ? '255, 255, 255' : '30, 38, 70'
    let dots: Dot[] = []
    let width = 0
    let height = 0
    let raf = 0
    let running = false
    let last = 0

    const paint = (): void => {
      ctx.clearRect(0, 0, width, height)
      for (let i = 0; i < dots.length; i += 1) {
        const d = dots[i]!
        for (let j = i + 1; j < dots.length; j += 1) {
          const o = dots[j]!
          const dx = d.x - o.x
          const dy = d.y - o.y
          const dist = Math.hypot(dx, dy)
          if (dist >= LINK_DISTANCE) continue
          ctx.strokeStyle = `rgba(${ink}, ${0.18 * (1 - dist / LINK_DISTANCE)})`
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(d.x, d.y)
          ctx.lineTo(o.x, o.y)
          ctx.stroke()
        }
      }
      for (const d of dots) {
        ctx.fillStyle = `rgba(${ink}, ${d.a})`
        ctx.beginPath()
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const step = (): void => {
      for (const d of dots) {
        d.x += d.vx
        d.y += d.vy
        // Bounce, so the field never drains out of one edge.
        if (d.x < 0 || d.x > width) d.vx = -d.vx
        if (d.y < 0 || d.y > height) d.vy = -d.vy
        d.x = Math.min(width, Math.max(0, d.x))
        d.y = Math.min(height, Math.max(0, d.y))
      }
      paint()
    }

    const tick = (now: number): void => {
      if (!running) return
      if (now - last >= FRAME_INTERVAL_MS) {
        last = now
        step()
      }
      raf = requestAnimationFrame(tick)
    }

    const setRunning = (): void => {
      const shouldRun = !reduced && !document.hidden && document.hasFocus()
      if (shouldRun && !running) {
        running = true
        raf = requestAnimationFrame(tick)
      } else if (!shouldRun && running) {
        running = false
        cancelAnimationFrame(raf)
      }
    }

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      width = Math.max(1, Math.round(rect.width))
      height = Math.max(1, Math.round(rect.height))
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.min(
        MAX_PARTICLES,
        Math.max(16, Math.round((PARTICLE_BASE * ((width * height) / 1000)) / PARTICLE_AREA)),
      )
      dots = makeDots(width, height, count)
      paint()
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()
    setRunning()
    document.addEventListener('visibilitychange', setRunning)
    window.addEventListener('focus', setRunning)
    window.addEventListener('blur', setRunning)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      observer.disconnect()
      document.removeEventListener('visibilitychange', setRunning)
      window.removeEventListener('focus', setRunning)
      window.removeEventListener('blur', setRunning)
    }
  }, [reduced, theme])

  return <canvas ref={canvasRef} className="h-full w-full" data-testid="backdrop-particles" />
}

export function BackdropTexture({
  texture,
  theme,
}: {
  texture: TextureName
  theme: ThemeName
}): React.JSX.Element | null {
  if (texture === 'none') return null
  return (
    <div
      className="pointer-events-none absolute inset-0 -z-10"
      data-testid="backdrop-texture"
      data-texture={texture}
      aria-hidden
    >
      {texture === 'grain' ? (
        <div
          className="h-full w-full"
          style={{
            backgroundImage: GRAIN_URL,
            backgroundRepeat: 'repeat',
            opacity: theme === 'dark' ? 0.055 : 0.04,
            mixBlendMode: theme === 'dark' ? 'overlay' : 'multiply',
          }}
        />
      ) : (
        <ParticleField theme={theme} />
      )}
    </div>
  )
}
