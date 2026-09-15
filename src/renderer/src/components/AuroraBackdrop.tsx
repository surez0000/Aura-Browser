import { useEffect, useRef, useState } from 'react'
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion'
import { cssFallbackGradient, paletteVec3, type AuroraPalette } from '@/theme/aurora'

/**
 * The animated Aurora Glass backdrop: four soft color fields drifting over the
 * theme ground, all pixels convex combinations of the (AA-band-clamped)
 * palette. WebGL fragment shader; CSS-gradient fallback when GL is missing.
 *
 * Behavior: cross-fades between palettes on Space/theme switches, pauses when
 * the window is hidden or unfocused, renders a single static frame under
 * prefers-reduced-motion, and draws at a capped backing resolution + ~30fps
 * (the drift is slow; the savings are large).
 */

const CROSSFADE_MS = 650
const FRAME_INTERVAL_MS = 33
const MAX_BACKING_WIDTH = 960

const VERT = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`

const FRAG = `precision mediump float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_mix;
uniform vec3 u_base;
uniform vec3 u_blobs[4];
uniform vec3 u_prevBase;
uniform vec3 u_prevBlobs[4];

vec2 orbit(float i, float t) {
  float sp = 0.045 + i * 0.012;
  float ph = i * 2.4;
  return vec2(0.5 + 0.44 * sin(t * sp + ph), 0.5 + 0.42 * cos(t * sp * 0.83 + ph * 1.6));
}
float w(vec2 uv, vec2 c, float r) {
  float d = distance(uv, c);
  return exp(-(d * d) / (r * r));
}
vec3 scene(vec2 uv, vec3 base, vec3 b0, vec3 b1, vec3 b2, vec3 b3, float t) {
  vec3 col = base;
  col = mix(col, b0, 0.85 * w(uv, orbit(0., t), 0.52));
  col = mix(col, b1, 0.80 * w(uv, orbit(1., t), 0.48));
  col = mix(col, b2, 0.80 * w(uv, orbit(2., t), 0.58));
  col = mix(col, b3, 0.75 * w(uv, orbit(3., t), 0.45));
  return col;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec3 cur = scene(uv, u_base, u_blobs[0], u_blobs[1], u_blobs[2], u_blobs[3], u_time);
  vec3 prev = scene(uv, u_prevBase, u_prevBlobs[0], u_prevBlobs[1], u_prevBlobs[2], u_prevBlobs[3], u_time);
  vec3 col = mix(prev, cur, u_mix);
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (n - 0.5) * (2.0 / 255.0); // dither against banding
  gl_FragColor = vec4(col, 1.0);
}`

interface GlState {
  gl: WebGLRenderingContext
  loc: {
    res: WebGLUniformLocation | null
    time: WebGLUniformLocation | null
    mix: WebGLUniformLocation | null
    base: WebGLUniformLocation | null
    blobs: WebGLUniformLocation | null
    prevBase: WebGLUniformLocation | null
    prevBlobs: WebGLUniformLocation | null
  }
}

function initGl(canvas: HTMLCanvasElement): GlState | null {
  try {
    const gl = canvas.getContext('webgl', {
      antialias: false,
      depth: false,
      stencil: false,
      alpha: false,
      powerPreference: 'low-power',
    })
    if (!gl) return null
    const compile = (type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type)
      if (!shader) return null
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null
      return shader
    }
    const vert = compile(gl.VERTEX_SHADER, VERT)
    const frag = compile(gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!vert || !frag || !program) return null
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const p = gl.getAttribLocation(program, 'p')
    gl.enableVertexAttribArray(p)
    gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0)

    return {
      gl,
      loc: {
        res: gl.getUniformLocation(program, 'u_res'),
        time: gl.getUniformLocation(program, 'u_time'),
        mix: gl.getUniformLocation(program, 'u_mix'),
        base: gl.getUniformLocation(program, 'u_base'),
        blobs: gl.getUniformLocation(program, 'u_blobs'),
        prevBase: gl.getUniformLocation(program, 'u_prevBase'),
        prevBlobs: gl.getUniformLocation(program, 'u_prevBlobs'),
      },
    }
  } catch {
    return null
  }
}

function blobsArray(palette: AuroraPalette): Float32Array {
  const out = new Float32Array(12)
  palette.blobs.forEach((blob, i) => out.set(paletteVec3(blob), i * 3))
  return out
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export function AuroraBackdrop({
  palette,
  paletteKey,
  hue,
}: {
  palette: AuroraPalette
  /** Changes whenever the palette inputs (hue, incognito, theme) change. */
  paletteKey: string
  hue: number
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const glRef = useRef<GlState | null>(null)
  const [mode, setMode] = useState<'webgl' | 'css'>('webgl')
  const reduced = usePrefersReducedMotion()
  const [animating, setAnimating] = useState(false)

  const fade = useRef({ key: paletteKey, prev: palette, cur: palette, start: 0 })
  const frame = useRef({ raf: 0, last: 0, running: false })

  // Palette transitions: remember the outgoing palette and restart the fade.
  useEffect(() => {
    const f = fade.current
    if (f.key !== paletteKey) {
      fade.current = { key: paletteKey, prev: f.cur, cur: palette, start: performance.now() }
    } else {
      f.cur = palette
    }
  }, [paletteKey, palette])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const state = initGl(canvas)
    if (!state) {
      setMode('css')
      return
    }
    glRef.current = state
    const frameState = frame.current

    const draw = (now: number): void => {
      const { gl, loc } = state
      const { prev, cur, start } = fade.current
      const rawMix = start === 0 ? 1 : Math.min(1, (now - start) / CROSSFADE_MS)
      // Reduced motion: a still frame, deterministic per palette.
      const time = reduced ? hueForTime(cur) : now / 1000
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform2f(loc.res, canvas.width, canvas.height)
      gl.uniform1f(loc.time, time)
      gl.uniform1f(loc.mix, easeInOutCubic(rawMix))
      gl.uniform3fv(loc.base, paletteVec3(cur.base))
      gl.uniform3fv(loc.blobs, blobsArray(cur))
      gl.uniform3fv(loc.prevBase, paletteVec3(prev.base))
      gl.uniform3fv(loc.prevBlobs, blobsArray(prev))
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const tick = (now: number): void => {
      if (!frameState.running) return
      const fading = fade.current.start !== 0 && now - fade.current.start < CROSSFADE_MS
      if (fading || now - frameState.last >= FRAME_INTERVAL_MS) {
        frameState.last = now
        draw(now)
      }
      frameState.raf = requestAnimationFrame(tick)
    }

    const setRunning = (): void => {
      const shouldRun = !reduced && !document.hidden && document.hasFocus()
      if (shouldRun && !frameState.running) {
        frameState.running = true
        frameState.raf = requestAnimationFrame(tick)
      } else if (!shouldRun && frameState.running) {
        frameState.running = false
        cancelAnimationFrame(frameState.raf)
      }
      setAnimating(shouldRun)
    }

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect()
      const scale = Math.min(1, MAX_BACKING_WIDTH / Math.max(1, rect.width))
      canvas.width = Math.max(2, Math.round(rect.width * scale))
      canvas.height = Math.max(2, Math.round(rect.height * scale))
      draw(performance.now())
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()
    setRunning()

    document.addEventListener('visibilitychange', setRunning)
    window.addEventListener('focus', setRunning)
    window.addEventListener('blur', setRunning)

    return () => {
      frameState.running = false
      cancelAnimationFrame(frameState.raf)
      observer.disconnect()
      document.removeEventListener('visibilitychange', setRunning)
      window.removeEventListener('focus', setRunning)
      window.removeEventListener('blur', setRunning)
      glRef.current = null
    }
  }, [reduced])

  // Under reduced motion (or while paused) the loop is off — draw palette and
  // theme changes as single frames.
  useEffect(() => {
    const state = glRef.current
    const canvas = canvasRef.current
    if (!state || !canvas || frame.current.running) return
    const now = performance.now()
    fade.current.start = 0 // no animated fade without a loop
    const { gl, loc } = state
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.uniform2f(loc.res, canvas.width, canvas.height)
    gl.uniform1f(loc.time, reduced ? hueForTime(palette) : now / 1000)
    gl.uniform1f(loc.mix, 1)
    gl.uniform3fv(loc.base, paletteVec3(palette.base))
    gl.uniform3fv(loc.blobs, blobsArray(palette))
    gl.uniform3fv(loc.prevBase, paletteVec3(palette.base))
    gl.uniform3fv(loc.prevBlobs, blobsArray(palette))
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }, [palette, reduced])

  return (
    <div
      className="absolute inset-0 -z-10"
      data-testid="aurora-backdrop"
      data-mode={mode}
      data-animating={mode === 'webgl' ? String(animating) : 'false'}
      data-hue={hue}
    >
      {mode === 'webgl' ? (
        <canvas ref={canvasRef} className="h-full w-full" />
      ) : (
        <div
          className="h-full w-full transition-colors duration-500"
          style={{ background: cssFallbackGradient(palette) }}
        />
      )}
    </div>
  )
}

/** Deterministic "frozen moment" per palette so static frames still vary. */
function hueForTime(palette: AuroraPalette): number {
  return (palette.base.r * 7 + palette.base.g * 13 + palette.base.b * 3) % 90
}
