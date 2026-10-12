import { Script } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { deliverScript, grammarPageScript } from '../../src/main/apps/grammar-page'

/**
 * The page script is shipped as source text built from Function#toString, so
 * a helper it forgot to carry along would only fail inside a real page. These
 * checks catch the cheap half of that here: it has to compile, and the
 * functions it is handed have to arrive whole.
 */
describe('grammar page script', () => {
  const cfg = { label: 'Gemini', shortcut: '⌥⌘G', maxChars: 4000, shadow: 'closed' as const }

  it('compiles as one expression', () => {
    expect(() => new Script(grammarPageScript(cfg))).not.toThrow()
  })

  it('carries the diff and the field rules as working functions', () => {
    const source = grammarPageScript(cfg)
    const libStart = source.lastIndexOf(', { diff: ')
    const lib = new Script(`(${source.slice(libStart + 2, -1)})`).runInNewContext({})
    const segs = lib.diff('I has it.', 'I have it.')
    expect(segs).toEqual([{ same: 'I ' }, { from: 'has', to: 'have' }, { same: ' it.' }])
    expect(lib.inputAllowed('password', '')).toBe(false)
    expect(lib.inputAllowed('text', '')).toBe(true)
  })

  it('passes the config through as data', () => {
    expect(grammarPageScript(cfg)).toContain('"shadow":"closed"')
  })

  it('delivers results as literals, whatever the text holds', () => {
    const code = deliverScript(3, {
      ok: true,
      corrected: 'Quote " and </script> and   line',
      label: 'x',
    })
    expect(() => new Script(code)).not.toThrow()
  })
})
