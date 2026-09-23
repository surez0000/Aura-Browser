import { describe, expect, it } from 'vitest'
import { withScriptsOff } from '../../src/main/services/web-store'

describe('withScriptsOff', () => {
  it('adds a no-scripts policy alongside the store’s own', () => {
    const headers = withScriptsOff({
      'content-security-policy': ["script-src 'nonce-abc' 'unsafe-inline'"],
      'content-type': ['text/html'],
    })
    expect(headers['content-security-policy']).toEqual([
      "script-src 'nonce-abc' 'unsafe-inline'",
      "script-src 'none'; object-src 'none'",
    ])
    expect(headers['content-type']).toEqual(['text/html'])
    expect(Object.keys(headers).filter((k) => /security-policy/i.test(k))).toHaveLength(1)
  })

  it('adds one when the response has none', () => {
    expect(withScriptsOff(undefined)).toEqual({
      'Content-Security-Policy': ["script-src 'none'; object-src 'none'"],
    })
  })
})
