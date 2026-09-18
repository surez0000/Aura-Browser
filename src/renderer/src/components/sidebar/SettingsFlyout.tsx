import { AnimatePresence, motion } from 'motion/react'
import { ExternalLink, RefreshCw, Settings } from 'lucide-react'
import type { AuroraSettings, UpdateState } from '@shared/models'
import { SEARCH_ENGINE_IDS, SEARCH_ENGINES } from '@shared/search'
import { popoverAnchorClass } from '@/lib/popover-anchor'
import { invoke, modKeyLabel } from '@/lib/ipc'
import { selectSidebarMode, useSettings } from '@/state/settings'
import { setSidebarMode } from '@/state/sync'
import { useUi } from '@/state/ui'

/** Sidebar footer gear. */
export function SettingsButton(): React.JSX.Element {
  const toggle = useUi((s) => s.toggleSettings)
  const status = useUi((s) => s.updateState?.status)
  return (
    <button
      type="button"
      title={`Settings (${modKeyLabel()},)`}
      aria-label="Settings"
      onClick={toggle}
      className="no-drag relative flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-(--surface-hover)"
      style={{ color: 'var(--ink-2)' }}
      data-testid="settings-button"
    >
      <Settings size={15} />
      {status === 'ready' && (
        <span
          className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full"
          style={{ background: 'var(--accent)' }}
          aria-hidden
        />
      )}
    </button>
  )
}

function Row({
  label,
  children,
}: {
  label: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2 py-1.5">
      <span className="text-[12px]" style={{ color: 'var(--ink-2)' }}>
        {label}
      </span>
      {/* Wide controls drop under the label instead of overflowing the panel. */}
      <div className="ml-auto flex min-w-0 max-w-full justify-end">{children}</div>
    </div>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  testId,
}: {
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
  testId: string
}): React.JSX.Element {
  return (
    <div className="glass flex rounded-lg p-0.5" role="radiogroup">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className="cursor-pointer rounded-md px-2 py-1 text-[11px] whitespace-nowrap transition-colors"
            style={{
              background: active ? 'var(--surface-glass-strong)' : 'transparent',
              color: active ? 'var(--ink-1)' : 'var(--ink-2)',
            }}
            data-testid={`${testId}-${o.value}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function Select<T extends string>({
  value,
  options,
  onChange,
  testId,
}: {
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
  testId: string
}): React.JSX.Element {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="glass cursor-pointer rounded-lg px-2 py-1 text-[12px] outline-none"
      style={{ color: 'var(--ink-1)', background: 'var(--surface-glass)' }}
      data-testid={testId}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

const ARCHIVE_OPTIONS = [
  { value: '0', label: 'Off' },
  { value: '6', label: '6 hours' },
  { value: '12', label: '12 hours' },
  { value: '24', label: '24 hours' },
  { value: '72', label: '3 days' },
] as const

/**
 * Settings popover anchored in the sidebar (⌘, or the gear): appearance,
 * sidebar mode, search engine, auto-archive, and the update status.
 */
export function SettingsFlyout(): React.JSX.Element {
  const compact = useSettings(selectSidebarMode) === 'compact'
  const open = useUi((s) => s.settingsOpen)
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const updateState = useUi((s) => s.updateState)

  const archiveValue = (
    ARCHIVE_OPTIONS.some((o) => Number(o.value) === settings.todayArchiveHours)
      ? String(settings.todayArchiveHours)
      : '12'
  ) as (typeof ARCHIVE_OPTIONS)[number]['value']

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 460, damping: 32 }}
          className={`popover ${popoverAnchorClass(compact)} rounded-xl p-2 shadow-2xl`}
          data-testid="settings-flyout"
        >
          <div
            className="px-2 pt-1 pb-2 text-[11px] font-medium tracking-wide uppercase"
            style={{ color: 'var(--ink-3)' }}
          >
            Settings
          </div>

          <Row label="Appearance">
            <Segmented<AuroraSettings['theme']>
              value={settings.theme}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
              onChange={(theme) => void update({ theme })}
              testId="setting-theme"
            />
          </Row>

          <Row label="Sidebar">
            <Segmented<AuroraSettings['sidebarMode']>
              value={settings.sidebarMode}
              options={[
                { value: 'fixed', label: 'Full' },
                { value: 'compact', label: 'Compact' },
              ]}
              onChange={(mode) => setSidebarMode(mode)}
              testId="setting-sidebar"
            />
          </Row>

          <Row label="Search engine">
            <Select<AuroraSettings['searchEngine']>
              value={settings.searchEngine}
              options={SEARCH_ENGINE_IDS.map((id) => ({
                value: id,
                label: SEARCH_ENGINES[id].name,
              }))}
              onChange={(searchEngine) => void update({ searchEngine })}
              testId="setting-search-engine"
            />
          </Row>

          <Row label="Auto-archive">
            <Select
              value={archiveValue}
              options={ARCHIVE_OPTIONS}
              onChange={(v) => void update({ todayArchiveHours: Number(v) })}
              testId="setting-archive"
            />
          </Row>

          <div className="mx-2 my-1 border-t" style={{ borderColor: 'var(--border-glass)' }} />
          <UpdatesSection state={updateState} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function UpdatesSection({ state }: { state: UpdateState | null }): React.JSX.Element {
  const version = state?.currentVersion ?? '…'
  const available = state?.availableVersion ?? ''
  let text = 'Updates are checked automatically.'
  let action: React.ReactNode = (
    <SmallButton
      label="Check for updates"
      onClick={() => void invoke('updates:check', {})}
      testId="updates-check"
    />
  )

  switch (state?.status) {
    case 'checking':
      text = 'Checking for updates…'
      action = null
      break
    case 'available':
      text = `Version ${available} found — downloading…`
      action = null
      break
    case 'downloading':
      text =
        (state.percent ?? 0) === 0
          ? `Starting download of ${available}…`
          : `Downloading ${available}… ${state.percent ?? 0}%`
      action = null
      break
    case 'ready':
      text = `Version ${available} is downloaded and ready.`
      action = (
        <SmallButton
          label="Restart to update"
          icon={<RefreshCw size={12} />}
          accent
          onClick={() => void invoke('updates:install', {})}
          testId="updates-install"
        />
      )
      break
    case 'up-to-date':
      text = 'You are up to date.'
      action = (
        <SmallButton
          label="Check again"
          onClick={() => void invoke('updates:check', {})}
          testId="updates-check"
        />
      )
      break
    case 'error':
      text = state.message ?? 'Update check failed.'
      action = (
        <div className="flex items-center gap-1.5">
          <SmallButton
            label="Try again"
            onClick={() => void invoke('updates:check', {})}
            testId="updates-check"
          />
          {state.releasesUrl && (
            <SmallButton
              label="Release page"
              icon={<ExternalLink size={12} />}
              onClick={() => void invoke('updates:openReleases', {})}
              testId="updates-releases"
            />
          )}
        </div>
      )
      break
    case 'unsupported':
      text = state.message ?? 'Updates are not available in this build.'
      action = state.releasesUrl ? (
        <SmallButton
          label="Release page"
          icon={<ExternalLink size={12} />}
          onClick={() => void invoke('updates:openReleases', {})}
          testId="updates-releases"
        />
      ) : null
      break
  }

  return (
    <>
      <Row label={<span data-testid="app-version">Aura Browser {version}</span>}>{action}</Row>
      <p
        className="px-2 pb-1 text-[11px] leading-snug"
        style={{ color: 'var(--ink-3)' }}
        data-testid="updates-status"
      >
        {text}
      </p>
    </>
  )
}

function SmallButton({
  label,
  icon,
  accent,
  onClick,
  testId,
}: {
  label: string
  icon?: React.ReactNode
  accent?: boolean
  onClick: () => void
  testId: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] whitespace-nowrap transition-colors hover:bg-(--surface-hover)"
      style={
        accent
          ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'transparent' }
          : { color: 'var(--ink-1)' }
      }
      data-testid={testId}
    >
      {icon}
      {label}
    </button>
  )
}
