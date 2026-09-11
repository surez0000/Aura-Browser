import { ArrowLeft, ArrowRight, RotateCw, X } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { useTabs, selectActiveTab } from '@/state/tabs'

function NavButton({
  label,
  disabled,
  onClick,
  children,
  testId,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
  testId?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="no-drag flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-(--surface-hover) disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent"
      style={{ color: 'var(--ink-2)' }}
      data-testid={testId}
    >
      {children}
    </button>
  )
}

export function NavCluster(): React.JSX.Element {
  const active = useTabs(selectActiveTab)

  return (
    <div className="flex shrink-0 items-center gap-1">
      <NavButton
        label="Back"
        testId="nav-back"
        disabled={!active?.canGoBack}
        onClick={() => void invoke('tabs:back', {})}
      >
        <ArrowLeft size={16} />
      </NavButton>
      <NavButton
        label="Forward"
        testId="nav-forward"
        disabled={!active?.canGoForward}
        onClick={() => void invoke('tabs:forward', {})}
      >
        <ArrowRight size={16} />
      </NavButton>
      {active?.isLoading ? (
        <NavButton label="Stop" testId="nav-stop" onClick={() => void invoke('tabs:stop', {})}>
          <X size={16} />
        </NavButton>
      ) : (
        <NavButton
          label="Reload"
          testId="nav-reload"
          disabled={!active}
          onClick={() => void invoke('tabs:reload', {})}
        >
          <RotateCw size={15} />
        </NavButton>
      )}
    </div>
  )
}
