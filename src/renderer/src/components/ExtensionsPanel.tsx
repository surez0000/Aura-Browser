import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { FolderOpen, Puzzle, RefreshCw, ShoppingBag, Trash2, X } from 'lucide-react'
import type { ExtensionInfo } from '@shared/models'
import { invoke, on } from '@/lib/ipc'
import { holdOverlay, releaseOverlay } from '@/lib/overlay'
import { useSettings } from '@/state/settings'
import { useUi } from '@/state/ui'

/**
 * Extensions manager. Extensions are installed once and run in every Space,
 * because they are part of how the browser behaves rather than part of an
 * identity — but their storage is per-Space, so their settings never cross.
 */
export function ExtensionsPanel(): React.JSX.Element {
  const open = useUi((s) => s.extensionsOpen)
  return <AnimatePresence>{open && <ExtensionsDialog />}</AnimatePresence>
}

function ExtensionsDialog(): React.JSX.Element {
  const close = useUi((s) => s.closeExtensions)
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const [list, setList] = useState<ExtensionInfo[]>([])

  useEffect(() => {
    void holdOverlay('extensions')
    return () => releaseOverlay('extensions')
  }, [])

  useEffect(() => {
    void invoke('extensions:list', {}).then(setList)
    return on('extensions:changed', setList)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  return (
    <motion.div
      className="absolute inset-0 z-50 flex items-start justify-center"
      data-testid="extensions-panel"
    >
      <motion.div
        className="absolute inset-0"
        style={{ background: 'var(--scrim)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={close}
      />
      <motion.div
        className="dialog relative mt-[9vh] flex max-h-[78vh] w-[min(720px,92vw)] flex-col rounded-2xl shadow-2xl"
        initial={{ y: -14, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: -10, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 480, damping: 34 }}
      >
        <div
          className="flex shrink-0 items-center gap-2 border-b px-4 py-3"
          style={{ borderColor: 'var(--border-glass)' }}
        >
          <Puzzle size={17} style={{ color: 'var(--accent)' }} />
          <span className="flex-1 text-[14px] font-medium" style={{ color: 'var(--ink-1)' }}>
            Extensions
          </span>
          <button
            type="button"
            onClick={() => void invoke('extensions:checkUpdates', {})}
            title="Check for extension updates"
            className="cursor-pointer rounded-lg p-1 transition-colors hover:bg-(--surface-hover)"
            style={{ color: 'var(--ink-3)' }}
            data-testid="extensions-update"
          >
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            onClick={close}
            title="Close"
            aria-label="Close extensions"
            className="cursor-pointer rounded-lg p-1 transition-colors hover:bg-(--surface-hover)"
            style={{ color: 'var(--ink-3)' }}
            data-testid="extensions-close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2" data-testid="extensions-list">
          {list.length === 0 && (
            <p className="px-3 py-10 text-center text-[13px]" style={{ color: 'var(--ink-3)' }}>
              No extensions yet. Add one from the Chrome Web Store, or load a folder.
            </p>
          )}
          {list.map((extension) => (
            <div
              key={extension.id}
              className="flex items-center gap-3 rounded-lg px-3 py-2"
              data-testid="extension-row"
              data-extension-id={extension.id}
              data-enabled={extension.enabled || undefined}
            >
              {extension.iconDataUrl ? (
                <img src={extension.iconDataUrl} alt="" className="h-7 w-7 shrink-0 rounded" />
              ) : (
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded"
                  style={{ background: 'var(--surface-glass-strong)', color: 'var(--ink-3)' }}
                >
                  <Puzzle size={14} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px]" style={{ color: 'var(--ink-1)' }}>
                  {extension.name}
                </div>
                <div className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
                  {extension.version}
                  {extension.unpacked ? ' · from a folder' : ''}
                  {extension.enabled ? '' : ' · off'}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={extension.enabled}
                onClick={() =>
                  void invoke('extensions:setEnabled', {
                    id: extension.id,
                    enabled: !extension.enabled,
                  })
                }
                className="relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors"
                style={{
                  background: extension.enabled ? 'var(--accent)' : 'var(--surface-glass-strong)',
                }}
                data-testid="extension-toggle"
              >
                <span
                  className="absolute top-0.5 h-4 w-4 rounded-full transition-all"
                  style={{
                    left: extension.enabled ? 18 : 2,
                    background: extension.enabled ? 'var(--accent-ink)' : 'var(--ink-3)',
                  }}
                />
              </button>
              <button
                type="button"
                onClick={() => void invoke('extensions:remove', { id: extension.id })}
                title={`Remove ${extension.name}`}
                aria-label={`Remove ${extension.name}`}
                className="shrink-0 cursor-pointer rounded p-1 transition-colors hover:bg-(--surface-hover)"
                style={{ color: 'var(--ink-3)' }}
                data-testid="extension-remove"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <div
          className="flex shrink-0 flex-wrap items-center gap-2 border-t px-4 py-3"
          style={{ borderColor: 'var(--border-glass)' }}
        >
          <button
            type="button"
            onClick={() => void invoke('extensions:openStore', {})}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
            data-testid="extensions-store"
          >
            <ShoppingBag size={13} />
            Chrome Web Store
          </button>
          <button
            type="button"
            onClick={() => void invoke('extensions:addUnpacked', {})}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] transition-colors hover:bg-(--surface-hover)"
            style={{ color: 'var(--ink-2)' }}
            data-testid="extensions-add-folder"
          >
            <FolderOpen size={13} />
            Load folder…
          </button>
          <div className="flex-1" />
          <label
            className="flex cursor-pointer items-center gap-2 text-[12px]"
            style={{ color: 'var(--ink-2)' }}
            title="Installing from the store adds a preload script to every page in the session."
          >
            <input
              type="checkbox"
              checked={settings.webStoreInstalls}
              onChange={(e) => void update({ webStoreInstalls: e.target.checked })}
              data-testid="extensions-allow-store"
            />
            Allow installing from the store
          </label>
        </div>
        {!settings.webStoreInstalls && (
          <p
            className="px-4 pb-3 text-[11px] leading-snug"
            style={{ color: 'var(--ink-3)' }}
            data-testid="extensions-store-note"
          >
            Store installs are off, so the store opens in your system browser. Turning them on lets
            the store install directly, at the cost of a preload script on every page in the
            session. Restart Aura Browser after changing this.
          </p>
        )}
      </motion.div>
    </motion.div>
  )
}
