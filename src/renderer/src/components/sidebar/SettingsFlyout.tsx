import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ExternalLink, RefreshCw, Settings, X } from 'lucide-react'
import type { AuroraSettings, UpdateState } from '@shared/models'
import { SEARCH_ENGINE_IDS, SEARCH_ENGINES } from '@shared/search'
import { holdOverlay, releaseOverlay } from '@/lib/overlay'
import { invoke, modKeyLabel } from '@/lib/ipc'
import { useSettings } from '@/state/settings'
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

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="px-2 py-2">
      <h3
        className="px-2 pb-1 text-[11px] font-medium tracking-wide uppercase"
        style={{ color: 'var(--ink-3)' }}
      >
        {title}
      </h3>
      {children}
    </section>
  )
}

function Row({
  label,
  hint,
  children,
}: {
  label: React.ReactNode
  hint?: string
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2 py-2">
      <span className="flex min-w-0 flex-col">
        <span className="text-[13px]" style={{ color: 'var(--ink-1)' }}>
          {label}
        </span>
        {hint && (
          <span className="text-[11px] leading-snug" style={{ color: 'var(--ink-3)' }}>
            {hint}
          </span>
        )}
      </span>
      {/* Wide controls drop under the label instead of overflowing the panel. */}
      <div className="ml-auto flex max-w-full min-w-0 justify-end">{children}</div>
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
            className="cursor-pointer rounded-md px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors"
            style={{
              background: active ? 'var(--surface-selected)' : 'transparent',
              color: active ? 'var(--ink-1)' : 'var(--ink-2)',
              boxShadow: active ? 'inset 0 0 0 1px var(--border-glass)' : 'none',
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

/** Settings (⌘, or the gear). Mounted fresh on every open, like History. */
export function SettingsPanel(): React.JSX.Element {
  const open = useUi((s) => s.settingsOpen)
  return <AnimatePresence>{open && <SettingsDialog />}</AnimatePresence>
}

/**
 * One scrolling page of settings over a snapshot of the page (ADR-0003).
 * It used to be a small popover in the sidebar that only the gear could
 * dismiss; it now closes on Escape, on the scrim, and on its own close button,
 * the same as every other dialog.
 */
function SettingsDialog(): React.JSX.Element {
  const close = useUi((s) => s.closeSettings)
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const updateState = useUi((s) => s.updateState)

  useEffect(() => {
    void holdOverlay('settings')
    return () => releaseOverlay('settings')
  }, [])

  // The panel holds no text field to carry a key handler, so Escape is caught
  // at the window instead.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const archiveValue = (
    ARCHIVE_OPTIONS.some((o) => Number(o.value) === settings.todayArchiveHours)
      ? String(settings.todayArchiveHours)
      : '12'
  ) as (typeof ARCHIVE_OPTIONS)[number]['value']

  return (
    <motion.div
      className="absolute inset-0 z-50 flex items-start justify-center"
      data-testid="settings-flyout"
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
        className="dialog relative mt-[8vh] flex max-h-[80vh] w-[min(640px,92vw)] flex-col rounded-2xl shadow-2xl"
        initial={{ y: -14, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: -10, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 480, damping: 34 }}
      >
        <div
          className="flex shrink-0 items-center gap-3 border-b px-4 py-3"
          style={{ borderColor: 'var(--border-glass)' }}
        >
          <h2 className="flex-1 text-[14px] font-medium" style={{ color: 'var(--ink-1)' }}>
            Settings
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close settings"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-(--surface-hover)"
            style={{ color: 'var(--ink-2)' }}
            data-testid="settings-close"
          >
            <X size={15} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <Section title="Appearance">
            <Row label="Theme">
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
            <Row
              label="Backdrop texture"
              hint="Grain is a fine still noise. Particles drift slowly and cost a little GPU."
            >
              <Segmented<AuroraSettings['backdropTexture']>
                value={settings.backdropTexture}
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'grain', label: 'Grain' },
                  { value: 'particles', label: 'Particles' },
                ]}
                onChange={(backdropTexture) => void update({ backdropTexture })}
                testId="setting-texture"
              />
            </Row>
          </Section>

          <Section title="Layout">
            <Row
              label="Tabs"
              hint="On top is the traditional strip. Spaces, favorites, downloads and settings stay on the left either way."
            >
              <Segmented<AuroraSettings['tabBar']>
                value={settings.tabBar}
                options={[
                  { value: 'side', label: 'Side' },
                  { value: 'top', label: 'Top' },
                ]}
                onChange={(tabBar) => void update({ tabBar })}
                testId="setting-tabbar"
              />
            </Row>
            <Row label="Sidebar width" hint="Only applies while the tabs are on the side.">
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
          </Section>

          <Section title="Search">
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
          </Section>

          <Section title="Tabs">
            <Row label="Auto-archive Today tabs" hint="Idle tabs move to the archive after this.">
              <Select
                value={archiveValue}
                options={ARCHIVE_OPTIONS}
                onChange={(v) => void update({ todayArchiveHours: Number(v) })}
                testId="setting-archive"
              />
            </Row>
          </Section>

          <Section title="Updates">
            <UpdatesSection state={updateState} />
          </Section>
        </div>
      </motion.div>
    </motion.div>
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
