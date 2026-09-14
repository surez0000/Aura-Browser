import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ShieldQuestion } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { useUi } from '@/state/ui'
import type { PermissionRequestInfo } from '@shared/models'

/**
 * In-chrome permission prompt (deny-by-default). Renders above the page card,
 * so the page shrinks under it — nothing floats over the native view.
 */
export function PermissionBanner(): React.JSX.Element {
  const request = useUi((s) => s.permissionQueue[0])
  return (
    <AnimatePresence>
      {request && (
        <motion.div
          key={request.id}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ type: 'spring', stiffness: 500, damping: 34 }}
        >
          <Banner key={request.id} request={request} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Banner({ request }: { request: PermissionRequestInfo }): React.JSX.Element {
  const [remember, setRemember] = useState(true)

  const respond = (allow: boolean): void => {
    void invoke('permissions:respond', { id: request.id, allow, remember })
    useUi.getState().shiftPermission()
  }

  return (
    <div
      className="glass flex items-center gap-3 rounded-xl px-3 py-2"
      data-testid="permission-banner"
    >
      <ShieldQuestion size={16} style={{ color: 'var(--accent)' }} />
      <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: 'var(--ink-1)' }}>
        Allow <strong>{request.host}</strong> to {request.description}?
      </span>
      <label
        className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11.5px]"
        style={{ color: 'var(--ink-2)' }}
      >
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Remember
      </label>
      <button
        type="button"
        onClick={() => respond(false)}
        className="shrink-0 cursor-pointer rounded-lg px-3 py-1 text-[12.5px] font-medium hover:bg-(--surface-hover)"
        style={{ color: 'var(--ink-2)' }}
        data-testid="permission-block"
      >
        Block
      </button>
      <button
        type="button"
        onClick={() => respond(true)}
        className="shrink-0 cursor-pointer rounded-lg px-3 py-1 text-[12.5px] font-medium"
        style={{ background: 'var(--surface-glass-strong)', color: 'var(--ink-1)' }}
        data-testid="permission-allow"
      >
        Allow
      </button>
    </div>
  )
}
