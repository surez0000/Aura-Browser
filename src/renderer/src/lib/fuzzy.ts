/**
 * Small dependency-free fuzzy scorer for the palette.
 * Returns 0 for no match; higher is better. Substring matches score in the
 * 5–8 band (start-of-string best); subsequence matches land below ~3, so a
 * real substring hit always beats a scattered subsequence.
 */
export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase()
  const t = text.toLowerCase()
  if (!q || !t) return 0

  const idx = t.indexOf(q)
  if (idx >= 0) {
    let score = 5 + Math.min(1, q.length / t.length)
    if (idx === 0) score += 2
    else if (!/[\w]/.test(t[idx - 1] ?? '')) score += 1
    return score
  }

  let score = 0
  let ti = 0
  let lastMatch = -2
  for (const ch of q) {
    const j = t.indexOf(ch, ti)
    if (j === -1) return 0
    if (j === lastMatch + 1) {
      score += 2 // consecutive run
    } else if (j === 0 || !/[\w]/.test(t[j - 1] ?? '')) {
      score += 1.5 // word boundary
    } else {
      score += 0.5
    }
    lastMatch = j
    ti = j + 1
  }
  return score / q.length
}

/** Convenience: best score across several haystacks. */
export function fuzzyBest(query: string, texts: Array<string | null | undefined>): number {
  let best = 0
  for (const text of texts) {
    if (text) best = Math.max(best, fuzzyScore(query, text))
  }
  return best
}
