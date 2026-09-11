import { describe, expect, it } from 'vitest'
import { fuzzyBest, fuzzyScore } from '@/lib/fuzzy'

describe('fuzzyScore', () => {
  it('returns 0 for no match and for empty queries', () => {
    expect(fuzzyScore('xyz', 'aurora')).toBe(0)
    expect(fuzzyScore('', 'aurora')).toBe(0)
    expect(fuzzyScore('aurora', '')).toBe(0)
  })

  it('is case-insensitive', () => {
    expect(fuzzyScore('AURORA', 'aurora glass')).toBeGreaterThan(0)
    expect(fuzzyScore('aurora', 'AURORA GLASS')).toBeGreaterThan(0)
  })

  it('scores substring matches above subsequence matches', () => {
    const substring = fuzzyScore('news', 'hacker news daily')
    const subsequence = fuzzyScore('news', 'n e w s scattered')
    expect(substring).toBeGreaterThan(subsequence)
  })

  it('prefers matches at the start of the text', () => {
    expect(fuzzyScore('git', 'github.com')).toBeGreaterThan(fuzzyScore('git', 'my github page'))
  })

  it('matches subsequences in order only', () => {
    expect(fuzzyScore('fxa', 'fixture a')).toBeGreaterThan(0)
    expect(fuzzyScore('axf', 'fixture a')).toBe(0)
  })

  it('fuzzyBest takes the best across haystacks and skips null', () => {
    expect(fuzzyBest('doc', [null, 'documentation', undefined, 'x'])).toBe(
      fuzzyScore('doc', 'documentation'),
    )
    expect(fuzzyBest('doc', [null, undefined])).toBe(0)
  })
})
