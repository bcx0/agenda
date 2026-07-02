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


/**
 * Confidence threshold for auto-linking a Google Calendar event title to an
 * existing client. Deliberately strict: an event title only links to a client
 * when we are *confident* it is the same person. Below this, the sync creates a
 * visible [NO_ACCOUNT] block that Geoffrey can reconcile - much safer than
 * silently attaching the RDV to the wrong client.
 *
 * Regression origin (bug juin 2026): the previous threshold of 0.5 linked
 * "Audrey Napoli" (score 0.538) to the existing client "Andrea Maron", so a
 * brand-new client was booked under the wrong name.
 */
export const CLIENT_MATCH_THRESHOLD = 0.85

/**
 * True when every token of the shorter name is a whole token of the longer name.
 * "Andrea" is a subset of "Andrea Maron" -> true. "Marie" is NOT a subset of
 * "Marie-Claire Dupont" -> false (avoids arbitrary substring collisions that
 * plain includes() produced).
 */
export function isTokenSubsetMatch(a: string, b: string): boolean {
  const at = nameTokens(a)
  const bt = nameTokens(b)
  if (at.length === 0 || bt.length === 0) return false
  const [small, big] = at.length <= bt.length ? [at, bt] : [bt, at]
  const bigSet = new Set(big)
  return small.every((t) => bigSet.has(t))
}

/**
 * Resolve a client-name query to the index of the best SAFE match among
 * `candidates`. Order of precedence:
 *   1. Exact match after normalization.
 *   2. Unique token-subset match (handles "Andrea" <-> "Andrea Maron").
 *      Ambiguous subset matches (0 or >1) are rejected on purpose.
 *   3. Fuzzy match at CLIENT_MATCH_THRESHOLD (typo tolerance only).
 *
 * Returns null when there is no confident match - the caller must NOT guess a
 * client in that case.
 */
export function matchClientNameIndex(
  query: string,
  candidates: string[],
  threshold = CLIENT_MATCH_THRESHOLD
): number | null {
  const qNorm = normalizeName(query)

  // 1. Exact normalized match
  for (let i = 0; i < candidates.length; i++) {
    if (normalizeName(candidates[i]) === qNorm) return i
  }

  // 2. Unique token-subset match
  const subsetMatches: number[] = []
  for (let i = 0; i < candidates.length; i++) {
    if (isTokenSubsetMatch(query, candidates[i])) subsetMatches.push(i)
  }
  if (subsetMatches.length === 1) return subsetMatches[0]

  // 3. Fuzzy typo tolerance
  const fuzzy = fuzzyMatchName(query, candidates, threshold)
  return fuzzy ? fuzzy.index : null
}
