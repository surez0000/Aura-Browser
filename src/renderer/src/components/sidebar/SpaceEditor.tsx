import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Trash2 } from 'lucide-react'
import { popoverAnchorClass } from '@/lib/popover-anchor'
import { selectSidebarMode, useSettings } from '@/state/settings'
import { invoke } from '@/lib/ipc'
import { gradientSwatchCss } from '@/theme/aurora'
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
    const fallback = GRADIENTS[(spaces.length + 1) % GRADIENTS.length] ?? GRADIENTS[0]!
    setHue(space?.accentHue ?? fallback[0])
    setHue2(space?.accentHue2 ?? fallback[1])
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
            <div className="mt-2 flex items-center gap-2">
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
                    background: gradientSwatchCss(h, h2, theme),
                    outline: hue === h ? '2px solid var(--ink-2)' : 'none',
                    outlineOffset: 1,
                  }}
                  data-testid={`space-hue-${h}`}
                />
              ))}
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
