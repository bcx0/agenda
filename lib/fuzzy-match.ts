/**
 * Fuzzy name matching utilities for Google Calendar sync.
 *
 * Geoffrey often misspells client names on Google Calendar.
 * This module handles:
 *   - Accent normalization  ("éèê" → "e")
 *   - Name order swap        ("Dupont Jean" matches "Jean Dupont")
 *   - Levenshtein distance   (typo tolerance)
 *   - Token-based matching   (each word compared independently)
 */

/** Strip accents/diacritics from a string */
function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** Normalize a name for comparison: lowercase, no accents, collapse whitespace */
export function normalizeName(name: string): string {
  return removeAccents(name.trim().replace(/\s+/g, ' ')).toLowerCase()
}

/** Split a name into sorted tokens for order-independent comparison */
function nameTokens(name: string): string[] {
  return normalizeName(name).split(' ').filter(Boolean).sort()
}

/** Classic Levenshtein distance */
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      )
    }
  }

  return dp[m][n]
}

/** Levenshtein similarity ratio (0..1, 1 = identical) */
function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(a, b) / maxLen
}

export interface FuzzyMatchResult {
  index: number
  score: number
}

/**
 * Find the best fuzzy match for `query` among `candidates`.
 *
 * Strategy (in priority order):
 * 1. Exact match after normalization            → score 1.0
 * 2. Token-sorted exact match (name order swap) → score 0.95
 * 3. Token-level fuzzy: compare each token pair → combined score
 * 4. Full-string Levenshtein                    → score
 *
 * Returns null if best score < threshold (default 0.65).
 */
export function fuzzyMatchName(
  query: string,
  candidates: string[],
  threshold = 0.65
): FuzzyMatchResult | null {
  const qNorm = normalizeName(query)
  const qTokens = nameTokens(query)

  let bestIndex = -1
  let bestScore = 0

  for (let i = 0; i < candidates.length; i++) {
    const cNorm = normalizeName(candidates[i])
    const cTokens = nameTokens(candidates[i])

    // 1. Exact normalized match
    if (qNorm === cNorm) {
      return { index: i, score: 1.0 }
    }

    // 2. Token-sorted exact match (handles "Dupont Jean" vs "Jean Dupont")
    if (qTokens.join(' ') === cTokens.join(' ')) {
      return { index: i, score: 0.95 }
    }

    // 3. Token-level fuzzy matching
    let tokenScore = 0
    if (qTokens.length > 0 && cTokens.length > 0) {
      // Try to match each query token to best candidate token
      const usedC = new Set<number>()
      let totalSim = 0
      for (const qt of qTokens) {
        let bestTokenSim = 0
        let bestTokenIdx = -1
        for (let ci = 0; ci < cTokens.length; ci++) {
          if (usedC.has(ci)) continue
          const sim = similarity(qt, cTokens[ci])
          if (sim > bestTokenSim) {
            bestTokenSim = sim
            bestTokenIdx = ci
          }
        }
        if (bestTokenIdx >= 0) usedC.add(bestTokenIdx)
        totalSim += bestTokenSim
      }
      // Weight by coverage: penalty if token counts differ
      const maxTokens = Math.max(qTokens.length, cTokens.length)
      tokenScore = (totalSim / maxTokens) * 0.95
    }

    // 4. Full-string similarity
    const fullScore = similarity(qNorm, cNorm)

    // Take the best of token and full-string
    const score = Math.max(tokenScore, fullScore)

    if (score > bestScore) {
      bestScore = score
      bestIndex = i
    }
  }

  if (bestScore >= threshold && bestIndex >= 0) {
    return { index: bestIndex, score: bestScore }
  }

  return null
}
