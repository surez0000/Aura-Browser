import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Trash2 } from 'lucide-react'
import { popoverAnchorClass } from '@/lib/popover-anchor'
import { selectSidebarMode, useSettings } from '@/state/settings'
import { invoke } from '@/lib/ipc'
import { auroraPalette, hue2Of, spaceGradientCss } from '@/theme/aurora'
import { toCss } from '@/theme/contrast'
import type { ThemeName } from '@shared/theme'
import { useTabs } from '@/state/tabs'
import { useUi } from '@/state/ui'

/**
 * Gradient presets, Arc-style: each Space picks a pair of stops. The first is
 * also the accent, and doubles as the preset's id so a Space keeps the same
 * identity when gradients are edited later.
 */
const GRADIENTS: ReadonlyArray<readonly [number, number]> = [
  [226, 276],
  [262, 316],
  [292, 340],
  [330, 18],
  [12, 44],
  [40, 92],
  [152, 196],
  [190, 238],
]
const HUES = GRADIENTS.map(([h]) => h)

/**
 * Rainbow track for the hue sliders, so the handle sits on its own colour.
 * Built from the same accents the chips use, in the current theme — a raw HSL
 * ramp read as a light-mode strip however dark the rest of the window was.
 */
function hueTrack(theme: ThemeName): string {
  const stops = [0, 40, 80, 120, 160, 200, 240, 280, 320, 360]
  return `linear-gradient(to right, ${stops
    .map((h) => toCss(auroraPalette(h, theme).blobs[0]))
    .join(', ')})`
}

/** One gradient stop, on a rainbow track. */
function HueSlider({
  label,
  value,
  onChange,
  testId,
  theme,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  testId: string
  theme: ThemeName
}): React.JSX.Element {
  return (
    <label className="mt-2 flex items-center gap-2">
      <span className="w-8 shrink-0 text-[11px]" style={{ color: 'var(--ink-3)' }}>
        {label}
      </span>
      <input
        type="range"
        min={0}
        max={359}
        value={((value % 360) + 360) % 360}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${label} colour`}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full"
        style={{ background: hueTrack(theme) }}
        data-testid={testId}
      />
    </label>
  )
}

/** Popover anchored above the switcher rail: create or edit a space. */
export function SpaceEditor(): React.JSX.Element | null {
  const compact = useSettings(selectSidebarMode) === 'compact'
  const editor = useUi((s) => s.spaceEditor)
  const close = useUi((s) => s.closeSpaceEditor)
  const spaces = useTabs((s) => s.spaces)
  const theme = useUi((s) => s.themeName)

  const space = editor.spaceId ? (spaces.find((s) => s.id === editor.spaceId) ?? null) : null
  const isEdit = !!space

  const [name, setName] = useState('')
  const [hue, setHue] = useState(HUES[0] ?? 226)
  const [hue2, setHue2] = useState<number | null>(GRADIENTS[0]?.[1] ?? null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Re-seed local fields whenever the editor (re)opens or targets a new space.
  const seedKey = `${editor.open}:${editor.spaceId ?? 'new'}`
  const [lastSeed, setLastSeed] = useState(seedKey)
  if (seedKey !== lastSeed) {
    setLastSeed(seedKey)
    setName(space?.name ?? '')
    if (space) {
      setHue(space.accentHue)
      // A Space made before gradients existed stores no second stop, and its
      // backdrop uses the default spread from the first. Seed that, not an
      // unrelated preset — the editor was opening on colours the Space had
      // never had, and saving would have applied them.
      setHue2(hue2Of(space))
    } else {
      const fallback = GRADIENTS[(spaces.length + 1) % GRADIENTS.length] ?? GRADIENTS[0]!
      setHue(fallback[0])
      setHue2(fallback[1])
    }
  }

  useEffect(() => {
    if (editor.open) inputRef.current?.focus()
  }, [editor.open])

  const canDelete =
    isEdit && space && (space.incognito || spaces.filter((s) => !s.incognito).length > 1)

  const submit = (): void => {
    if (isEdit && space) {
      if (name.trim() && name.trim() !== space.name) {
        void invoke('spaces:rename', { spaceId: space.id, name: name.trim() })
      }
      if ((hue !== space.accentHue || hue2 !== space.accentHue2) && !space.incognito) {
        void invoke('spaces:setAccent', { spaceId: space.id, accentHue: hue, accentHue2: hue2 })
      }
    } else {
      void invoke('spaces:create', {
        name: name.trim() || undefined,
        accentHue: hue,
        accentHue2: hue2,
      })
    }
    close()
  }

  return (
    <AnimatePresence>
      {editor.open && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 460, damping: 32 }}
          className={`popover ${popoverAnchorClass(compact)} rounded-xl p-3 shadow-2xl`}
          data-testid="space-editor"
        >
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              else if (e.key === 'Escape') close()
            }}
            placeholder={isEdit ? 'Space name' : 'New space name'}
            maxLength={40}
            className="w-full rounded-lg border-none bg-transparent px-1 py-1 text-[13px] outline-none"
            style={{ color: 'var(--ink-1)' }}
            data-testid="space-name-input"
          />
          {!space?.incognito && (
            <div className="mt-2">
              {/*
               * The real backdrop colours, not the accent. Accents are lifted
               * to stay legible on the ground they sit on, so in dark mode
               * they are pale — which made this bar promise a light Space and
               * then apply a dark one. The chips below stay on the accent:
               * they are identity marks, and true backdrop colours would make
               * them near-identical in dark mode.
               */}
              <div
                className="h-7 w-full rounded-lg"
                style={{
                  background: spaceGradientCss(
                    { accentHue: hue, accentHue2: hue2, incognito: false },
                    theme,
                  ),
                }}
                data-testid="space-gradient-preview"
                aria-hidden
              />
              <div className="mt-2 flex items-center justify-between gap-1">
                {GRADIENTS.map(([h, h2]) => (
                  <button
                    key={h}
                    type="button"
                    aria-label={`Gradient ${h} to ${h2}`}
                    onClick={() => {
                      setHue(h)
                      setHue2(h2)
                    }}
                    className="h-4 w-4 cursor-pointer rounded-full transition-transform hover:scale-110"
                    style={{
                      // The Space's real colours, so light mode offers the pale
                      // gradients it will actually paint. Built from the accent
                      // these read inverted: dark chips under a light theme.
                      background: spaceGradientCss(
                        { accentHue: h, accentHue2: h2, incognito: false },
                        theme,
                      ),
                      boxShadow:
                        hue === h && hue2 === h2
                          ? '0 0 0 2px var(--ink-2)'
                          : '0 0 0 1px var(--border-glass)',
                    }}
                    data-testid={`space-hue-${h}`}
                  />
                ))}
              </div>
              <HueSlider
                label="Start"
                value={hue}
                onChange={setHue}
                testId="space-hue-start"
                theme={theme}
              />
              <HueSlider
                label="End"
                value={hue2 ?? hue + 52}
                onChange={(v) => setHue2(v)}
                testId="space-hue-end"
                theme={theme}
              />
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            {isEdit && (
              <button
                type="button"
                disabled={!canDelete}
                title={canDelete ? 'Delete space (tabs are archived)' : 'The last space stays'}
                onClick={() => {
                  if (space) void invoke('spaces:remove', { spaceId: space.id })
                  close()
                }}
                className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[12px] disabled:cursor-default disabled:opacity-35"
                style={{ color: 'var(--danger)' }}
                data-testid="space-delete"
              >
                <Trash2 size={12} /> Delete
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={close}
              className="cursor-pointer rounded-lg px-2.5 py-1 text-[12px] hover:bg-(--surface-hover)"
              style={{ color: 'var(--ink-2)' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              className="cursor-pointer rounded-lg px-2.5 py-1 text-[12px] font-medium"
              style={{ background: 'var(--surface-glass-strong)', color: 'var(--ink-1)' }}
              data-testid="space-save"
            >
              {isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
