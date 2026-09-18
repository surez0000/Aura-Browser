import { Minus, Square, X } from 'lucide-react'
import { invoke } from '@/lib/ipc'

/** Custom window controls for Windows/Linux (frameless window). */
export function WindowControls({
  vertical = false,
}: { vertical?: boolean } = {}): React.JSX.Element {
  const control = (action: 'minimize' | 'maximize' | 'close'): void => {
    void invoke('window:control', { action })
  }

  const cls = `no-drag flex cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-(--surface-hover) ${
    vertical ? 'h-7 w-9' : 'h-7 w-8'
  }`

  return (
    <div
      className={`flex gap-0.5 ${vertical ? 'flex-col items-center' : 'items-center'}`}
      style={{ color: 'var(--ink-2)' }}
    >
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
