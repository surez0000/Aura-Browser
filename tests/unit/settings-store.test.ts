import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type AuroraSettings } from '@shared/models'

// Simulated main process: each settings:set resolves when the test says so.
type Pending = { patch: Partial<AuroraSettings>; resolve: (s: AuroraSettings) => void }
const pending: Pending[] = []
let mainSettings: AuroraSettings = { ...DEFAULT_SETTINGS }

vi.mock('@/lib/ipc', () => ({
  invoke: (channel: string, patch: Partial<AuroraSettings>) => {
    if (channel !== 'settings:set') throw new Error(`unexpected ${channel}`)
    mainSettings = { ...mainSettings, ...patch }
    return new Promise<AuroraSettings>((resolve) => pending.push({ patch, resolve }))
  },
}))

const { useSettings } = await import('@/state/settings')

describe('settings store ordering', () => {
  beforeEach(() => {
    pending.length = 0
    mainSettings = { ...DEFAULT_SETTINGS }
    useSettings.setState({ settings: { ...DEFAULT_SETTINGS }, loaded: true })
  })

  it('a late reply from an older write never undoes a newer optimistic write', async () => {
    const store = useSettings.getState()
    const first = store.update({ sidebarMode: 'hover' }) // ⌘S
    const second = store.update({ sidebarMode: 'fixed' }) // ⌘S again, quickly
    expect(useSettings.getState().settings.sidebarMode).toBe('fixed')

    // Main answers the first write late, with the settings as of that write.
    pending[0]!.resolve({ ...DEFAULT_SETTINGS, sidebarMode: 'hover' })
    await first
    expect(useSettings.getState().settings.sidebarMode).toBe('fixed')

    pending[1]!.resolve({ ...DEFAULT_SETTINGS, sidebarMode: 'fixed' })
    await second
    expect(useSettings.getState().settings.sidebarMode).toBe('fixed')
  })

  it('ignores pushes while a write is in flight, then applies them again', async () => {
    const store = useSettings.getState()
    const write = store.update({ theme: 'dark' })
    store.apply({ ...DEFAULT_SETTINGS, theme: 'system' }) // stale push from the older state
    expect(useSettings.getState().settings.theme).toBe('dark')

    pending[0]!.resolve({ ...DEFAULT_SETTINGS, theme: 'dark' })
    await write
    store.apply({ ...DEFAULT_SETTINGS, theme: 'light' }) // a real external change afterwards
    expect(useSettings.getState().settings.theme).toBe('light')
  })
})
