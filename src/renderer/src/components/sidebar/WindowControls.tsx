import { Minus, Square, X } from 'lucide-react'
import { invoke } from '@/lib/ipc'

/** Custom window controls for Windows/Linux (frameless window). */
export function WindowControls(): React.JSX.Element {
  const control = (action: 'minimize' | 'maximize' | 'close'): void => {
    void invoke('window:control', { action })
  }

  const cls =
    'no-drag flex h-7 w-8 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-(--surface-hover)'

  return (
    <div className="flex items-center gap-0.5" style={{ color: 'var(--ink-2)' }}>
      <button
        type="button"
        title="Minimize"
        aria-label="Minimize"
        className={cls}
        onClick={() => control('minimize')}
      >
        <Minus size={14} />
      </button>
      <button
        type="button"
        title="Maximize"
        aria-label="Maximize"
        className={cls}
        onClick={() => control('maximize')}
      >
        <Square size={12} />
      </button>
      <button
        type="button"
        title="Close"
        aria-label="Close"
        className={cls}
        onClick={() => control('close')}
      >
        <X size={15} />
      </button>
    </div>
  )
}
