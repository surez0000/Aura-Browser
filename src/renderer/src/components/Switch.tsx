/** The on/off switch used by the App Store and the extensions manager. */
export function Switch({
  on,
  onChange,
  label,
  disabled,
  testId,
}: {
  on: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
  testId?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-default disabled:opacity-40"
      style={{ background: on ? 'var(--accent)' : 'var(--surface-glass-strong)' }}
      data-testid={testId}
      data-on={on || undefined}
    >
      <span
        className="absolute top-0.5 h-4 w-4 rounded-full transition-all"
        style={{ left: on ? 18 : 2, background: on ? 'var(--accent-ink)' : 'var(--ink-3)' }}
      />
    </button>
  )
}
