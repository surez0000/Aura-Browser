import { useEffect, useRef, useState } from 'react'
import { Loader2, Lock, Search, Star, TriangleAlert } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { displayLabel, fullLabel, normalizeInput } from '@/lib/url'
import { useSettings } from '@/state/settings'
import { useTabs, selectActiveTab, selectActiveSpace } from '@/state/tabs'
import { useUi } from '@/state/ui'

function SecurityIcon({ state }: { state: 'secure' | 'insecure' | 'neutral' }): React.JSX.Element {
  if (state === 'secure') return <Lock size={13} style={{ color: 'var(--ink-2)' }} />
  if (state === 'insecure') return <TriangleAlert size={13} style={{ color: 'var(--danger)' }} />
  return <Search size={13} style={{ color: 'var(--ink-3)' }} />
}

/**
 * The address field. In the sidebar it is a compact pill showing just the host,
 * because the column is narrow and the host is what identifies a page at a
 * glance; click it, or ⌘L, to edit inline.
 *
 * With the tabs on top it is a full-width address bar, so `full` shows the
 * whole URL — path and query included — the way an address bar is expected to.
 * Showing only the host in a bar that wide reads as a browser that has lost
 * the address.
 */
export function UrlPill({ full = false }: { full?: boolean } = {}): React.JSX.Element {
  const active = useTabs(selectActiveTab)
  const activeSpace = useTabs(selectActiveSpace)
  const favorites = activeSpace?.favorites ?? []
  const editRequest = useUi((s) => s.urlEditRequest)

  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  const currentUrl = active?.url || active?.pendingUrl || ''
  const isFavorite = !!currentUrl && favorites.some((f) => f.url === currentUrl)

  // ⌘L bumps a request counter; adjust state during render (React's endorsed
  // pattern for reacting to an external "event" value without an effect).
  const [handledRequest, setHandledRequest] = useState(editRequest)
  if (editRequest !== handledRequest) {
    setHandledRequest(editRequest)
    setValue(currentUrl)
    setEditing(true)
  }

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const stopEditing = (): void => {
    setEditing(false)
  }

  const submit = (): void => {
    const url = normalizeInput(value, useSettings.getState().settings.searchEngine)
    if (url) {
      if (active) void invoke('tabs:navigate', { tabId: active.id, url })
      else void invoke('tabs:create', { url, activate: true })
    }
    stopEditing()
  }

  const toggleFavorite = (): void => {
    if (!active || !currentUrl) return
    if (isFavorite) {
      void invoke('favorites:remove', { url: currentUrl })
    } else {
      // Stay inside the IPC schema: long titles and data: favicons must not
      // make the whole request fail silently.
      const faviconUrl =
        active.faviconUrl &&
        active.faviconUrl.length <= 2048 &&
        !active.faviconUrl.startsWith('data:')
          ? active.faviconUrl
          : null
      invoke('favorites:add', {
        url: currentUrl,
        title: (active.title || displayLabel(currentUrl)).slice(0, 512),
        faviconUrl,
      }).catch((error: unknown) => console.error('favorites:add failed', error))
    }
  }

  if (editing) {
    return (
      <div
        className={`glass no-drag flex h-9 items-center gap-2 rounded-(--radius-pill) px-3 ${
          full ? 'w-full' : 'shrink-0'
        }`}
      >
        <Search size={13} style={{ color: 'var(--ink-3)' }} />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            else if (e.key === 'Escape') stopEditing()
          }}
          onBlur={stopEditing}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="Search or enter URL…"
          className="w-full bg-transparent text-[13px] outline-none"
          style={{ color: 'var(--ink-1)' }}
          data-testid="url-input"
        />
      </div>
    )
  }

  return (
    <div
      className={`glass no-drag flex h-9 cursor-text items-center gap-2 rounded-(--radius-pill) px-3 ${
        full ? 'w-full' : 'shrink-0'
      }`}
      onClick={() => {
        setValue(currentUrl)
        setEditing(true)
      }}
      title={currentUrl || 'Search or enter URL'}
      data-testid="url-pill"
    >
      {active?.isLoading ? (
        <Loader2
          size={13}
          className="animate-spin"
          style={{ color: 'var(--ink-3)' }}
          data-testid="url-loading"
        />
      ) : (
        <SecurityIcon state={active?.security ?? 'neutral'} />
      )}
      <span
        className="min-w-0 flex-1 truncate text-[13px]"
        style={{ color: 'var(--ink-2)' }}
        data-testid="url-label"
      >
        {full ? fullLabel(currentUrl) || 'Search or enter URL' : displayLabel(currentUrl || null)}
      </span>
      {active && currentUrl.startsWith('http') && (
        <button
          type="button"
          title={isFavorite ? 'Remove favorite' : 'Add to favorites'}
          aria-label={isFavorite ? 'Remove favorite' : 'Add to favorites'}
          onClick={(e) => {
            e.stopPropagation()
            toggleFavorite()
          }}
          className="cursor-pointer rounded p-0.5 transition-colors hover:bg-(--surface-hover)"
          data-testid="favorite-toggle"
        >
          <Star
            size={13}
            style={{ color: isFavorite ? 'var(--accent)' : 'var(--ink-3)' }}
            fill={isFavorite ? 'var(--accent)' : 'none'}
          />
        </button>
      )}
    </div>
  )
}
