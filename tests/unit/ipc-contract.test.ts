import { describe, expect, it } from 'vitest'
import { INVOKE_CHANNELS, PUSH_CHANNELS } from '@shared/ipc-contract'

describe('ipc contract', () => {
  it('has no duplicate invoke channels', () => {
    expect(new Set(INVOKE_CHANNELS).size).toBe(INVOKE_CHANNELS.length)
  })

  it('has no duplicate push channels', () => {
    expect(new Set(PUSH_CHANNELS).size).toBe(PUSH_CHANNELS.length)
  })

  it('keeps invoke and push channel names disjoint', () => {
    const invokes = new Set<string>(INVOKE_CHANNELS)
    for (const push of PUSH_CHANNELS) {
      expect(invokes.has(push)).toBe(false)
    }
  })

  it('namespaces every channel', () => {
    for (const channel of [...INVOKE_CHANNELS, ...PUSH_CHANNELS]) {
      expect(channel).toMatch(/^[a-z][a-zA-Z]*:[a-zA-Z]+$/)
    }
  })
})
