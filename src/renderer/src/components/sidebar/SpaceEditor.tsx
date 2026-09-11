import { useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { useTabs } from '@/state/tabs'
import { useUi } from '@/state/ui'

const HUES = [226, 262, 292, 330, 12, 40, 152, 190]

/** Popover anchored above the switcher rail: create or edit a space. */
export function SpaceEditor(): React.JSX.Element | null {
  const editor = useUi((s) => s.spaceEditor)
  const close = useUi((s) => s.closeSpaceEditor)
  const spaces = useTabs((s) => s.spaces)

  const space = editor.spaceId ? (spaces.find((s) => s.id === editor.spaceId) ?? null) : null
  const isEdit = !!space

  const [name, setName] = useState('')
  const [hue, setHue] = useState(HUES[0] ?? 226)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Re-seed local fields whenever the editor (re)opens or targets a new space.
  const seedKey = `${editor.open}:${editor.spaceId ?? 'new'}`
  const [lastSeed, setLastSeed] = useState(seedKey)
  if (seedKey !== lastSeed) {
    setLastSeed(seedKey)
    setName(space?.name ?? '')
    setHue(space?.accentHue ?? HUES[(spaces.length + 1) % HUES.length] ?? 226)
  }

  useEffect(() => {
    if (editor.open) inputRef.current?.focus()
  }, [editor.open])

  if (!editor.open) return null

  const canDelete =
    isEdit && space && (space.incognito || spaces.filter((s) => !s.incognito).length > 1)

  const submit = (): void => {
    if (isEdit && space) {
      if (name.trim() && name.trim() !== space.name) {
        void invoke('spaces:rename', { spaceId: space.id, name: name.trim() })
      }
      if (hue !== space.accentHue && !space.incognito) {
        void invoke('spaces:setAccent', { spaceId: space.id, accentHue: hue })
      }
    } else {
      void invoke('spaces:create', { name: name.trim() || undefined, accentHue: hue })
    }
    close()
  }

  return (
    <div
      className="glass absolute right-3 bottom-12 left-3 z-30 rounded-xl p-3 shadow-2xl"
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
          {HUES.map((h) => (
            <button
              key={h}
              type="button"
              aria-label={`Accent hue ${h}`}
              onClick={() => setHue(h)}
              className="h-4 w-4 cursor-pointer rounded-full transition-transform hover:scale-110"
              style={{
                background: `hsl(${h} 70% 62%)`,
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
    </div>
  )
}
