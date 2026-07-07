/**
 * ocrMatch.ts
 *
 * Turns raw, noisy OCR text into a normalized string, then scores it
 * against a list of candidate products using a dependency-free fuzzy
 * similarity (normalized Levenshtein distance + word-set overlap +
 * substring containment). No external fuzzy-matching library (e.g.
 * Fuse.js) was added for this — the scan box (see ocrImage.ts) is
 * deliberately small, so a single OCR pass usually yields one short line
 * of text (the product name), which whole-string similarity handles well
 * without needing a heavier tokenized search index.
 */

export interface MatchCandidate {
  id:            string
  name:          string
  generic_name?: string
  company_name?: string
  item_code?:    string
  [key: string]: any
}

export interface ScoredMatch<T extends MatchCandidate = MatchCandidate> {
  product:      T
  score:        number // 0..1
  matchedField: string
}

// Confidence tiers — see useLocalScanner.ts for how these gate
// auto-select vs. "pick from these" vs. "no match".
export const MATCH_AUTO_THRESHOLD    = 0.90
export const MATCH_SUGGEST_THRESHOLD = 0.70
export const MATCH_SUGGEST_LIMIT     = 5

// ── Token-level OCR mistake correction ───────────────────────────────────
// Common OCR misreads on product packaging: 0↔O and 1↔I. Which direction
// is "correct" depends on what kind of token it is — inside a mostly-
// alphabetic word (a product/brand name), a stray digit was probably a
// misread letter; inside a mostly-numeric token (a dosage, batch number,
// MRP), a stray letter was probably a misread digit. Applying this
// unconditionally in one direction would just trade one class of mistake
// for another (e.g. turning a legitimate "500mg" into "5OOmg").
function fixOcrToken(token: string): string {
  const letters = (token.match(/[A-Za-z]/g) || []).length
  const digits  = (token.match(/[0-9]/g) || []).length
  if (letters === 0 || digits === 0) return token
  if (digits > letters) return token.replace(/O/g, '0').replace(/[Il]/g, '1')
  if (letters > digits) return token.replace(/0/g, 'O').replace(/1/g, 'I')
  return token
}

// Lowercase, trim, collapse whitespace, strip punctuation, and apply the
// per-token OCR correction above. Idempotent — safe to call on both the
// live OCR text and each candidate's own fields before comparing them.
export function normalizeOcrText(raw: string): string {
  if (!raw) return ''
  const corrected = raw
    .split(/\s+/)
    .filter(Boolean)
    .map(fixOcrToken)
    .join(' ')

  return corrected
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // strip punctuation
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Similarity scoring ────────────────────────────────────────────────
function levenshteinDistance(a: string, b: string): number {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = new Array(n + 1)
  for (let j = 0; j <= n; j++) dp[j] = j
  for (let i = 1; i <= m; i++) {
    let prevDiag = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const temp = dp[j]
      dp[j] = a[i - 1] === b[j - 1] ? prevDiag : 1 + Math.min(prevDiag, dp[j], dp[j - 1])
      prevDiag = temp
    }
  }
  return dp[n]
}

// 1.0 = identical, 0.0 = completely different, scaled by the longer
// string's length so short and long fields are comparable.
function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshteinDistance(a, b) / maxLen
}

// Word-set overlap — catches cases where OCR read the right words in a
// different order or with an extra/missing word, which whole-string
// Levenshtein alone penalizes too harshly.
function tokenJaccard(a: string, b: string): number {
  const setA = new Set(a.split(' ').filter(Boolean))
  const setB = new Set(b.split(' ').filter(Boolean))
  if (setA.size === 0 || setB.size === 0) return 0
  let intersect = 0
  for (const t of setA) if (setB.has(t)) intersect++
  const union = setA.size + setB.size - intersect
  return union === 0 ? 0 : intersect / union
}

// If the OCR text is a label with extra surrounding text (or vice versa),
// and one string fully contains the other, that's very likely the right
// product even though whole-string Levenshtein would score it poorly due
// to the length difference.
function containmentBoost(a: string, b: string): number {
  if (!a || !b) return 0
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  if (shorter.length < 3 || !longer.includes(shorter)) return 0
  return 0.9 + 0.1 * (shorter.length / longer.length)
}

function fieldScore(normField: string, normText: string): number {
  if (!normField) return 0
  // Note: an exact match after normalization always scores 1.0 here via
  // levenshteinSimilarity — there's no separate "try exact match first"
  // code path because it falls out of this scoring naturally and is
  // always attempted first (Math.max short-circuits nothing, but a
  // perfect score can't be beaten by the other two heuristics).
  return Math.max(
    levenshteinSimilarity(normField, normText),
    tokenJaccard(normField, normText),
    containmentBoost(normField, normText),
  )
}

// Scores `ocrText` against every candidate's name / generic name / brand
// (company) name / item code, taking each candidate's single best-matching
// field, and returns all candidates ranked best-first.
export function matchProduct<T extends MatchCandidate>(ocrText: string, candidates: T[]): ScoredMatch<T>[] {
  const normText = normalizeOcrText(ocrText)
  if (!normText) return []

  const fieldsOf = (c: T): Array<[string, string | undefined]> => [
    ['name', c.name],
    ['generic_name', c.generic_name],
    ['company_name', c.company_name],
    ['item_code', c.item_code],
  ]

  const scored: ScoredMatch<T>[] = candidates.map(c => {
    let best = 0, bestField = 'name'
    for (const [key, value] of fieldsOf(c)) {
      if (!value) continue
      const s = fieldScore(normalizeOcrText(value), normText)
      if (s > best) { best = s; bestField = key }
    }
    return { product: c, score: best, matchedField: bestField }
  })

  return scored.sort((a, b) => b.score - a.score)
}
