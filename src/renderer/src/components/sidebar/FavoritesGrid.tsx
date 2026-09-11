import { useState } from 'react'
import { invoke } from '@/lib/ipc'
import { displayLabel } from '@/lib/url'
import { useTabs, selectActiveSpace } from '@/state/tabs'
import type { FavoriteEntry } from '@shared/models'

function hueFor(url: string): number {
  let hash = 0
  for (let i = 0; i < url.length; i++) hash = (hash * 31 + url.charCodeAt(i)) | 0
  return Math.abs(hash) % 360
}

function FavoriteTile({ favorite }: { favorite: FavoriteEntry }): React.JSX.Element {
  const [imgFailed, setImgFailed] = useState(false)
  const tabs = useTabs((s) => s.tabs)
  const activeSpaceId = useTabs((s) => s.activeSpaceId)

  const open = (): void => {
    const existing = tabs.find(
      (t) => t.spaceId === activeSpaceId && (t.url || t.pendingUrl) === favorite.url,
    )
    if (existing) void invoke('tabs:activate', { tabId: existing.id })
    else void invoke('tabs:create', { url: favorite.url, activate: true })
  }

  const letter = (favorite.title || displayLabel(favorite.url)).charAt(0).toUpperCase()

  return (
    <button
      type="button"
      title={`${favorite.title}\n${favorite.url}\nRight-click to remove`}
      onClick={open}
      onContextMenu={(e) => {
        e.preventDefault()
        void invoke('favorites:remove', { url: favorite.url })
      }}
      className="glass no-drag flex aspect-square cursor-pointer items-center justify-center rounded-xl transition-transform hover:scale-[1.04] active:scale-[0.97]"
      data-testid="favorite-tile"
    >
      {favorite.faviconUrl && !imgFailed ? (
        <img
          src={favorite.faviconUrl}
          alt=""
          className="h-5 w-5"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span
          className="flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-semibold text-white"
          style={{ background: `hsl(${hueFor(favorite.url)} 55% 46% / 0.9)` }}
        >
          {letter}
        </span>
      )}
    </button>
  )
}

/** Favorites of the active space (each space has its own grid). */
export function FavoritesGrid(): React.JSX.Element | null {
  // Select the (stable) space object; deriving `?? []` inside the selector
  // would mint a fresh array per call and loop useSyncExternalStore.
  const space = useTabs(selectActiveSpace)
  const favorites = space?.favorites ?? []

  if (favorites.length === 0) {
    return (
      <p className="mx-1 shrink-0 text-[11px] leading-snug" style={{ color: 'var(--ink-3)' }}>
        No favorites yet — hit the ★ in the address pill.
      </p>
    )
  }

  return (
    <div className="grid shrink-0 grid-cols-4 gap-2" data-testid="favorites-grid">
      {favorites.map((f) => (
        <FavoriteTile key={f.url} favorite={f} />
      ))}
    </div>
  )
}
