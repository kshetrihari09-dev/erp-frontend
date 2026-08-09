/**
 * parseProductOcr.ts
 *
 * Best-effort heuristics that turn raw OCR text (read off a product
 * box/label/strip by Tesseract) into candidate values for the New Product
 * form. This is intentionally conservative — OCR off real-world packaging
 * is noisy, so we only fill in fields we're reasonably confident about and
 * always let the user review/edit before saving.
 */

export interface ParsedProductFields {
  name?:          string
  generic_name?:  string
  company_name?:  string
  mrp?:           number
}

// Exported (not just module-local) so pharmaOcrParser.ts — the ML Kit
// structured-result classifier used by the live scanner — reuses these
// exact patterns instead of maintaining a second, possibly-drifting copy.
export const COMPANY_HINTS = [
  'pvt', 'ltd', 'limited', 'pharma', 'pharmaceutical', 'pharmaceuticals',
  'laboratories', 'labs', 'industries', 'healthcare', 'life sciences',
  'biotech', 'drugs', 'formulations',
]

export const NOISE_LINE = /^[\W_]*$/                       // punctuation-only lines
export const MRP_LINE    = /\b(?:m\.?r\.?p\.?|mrp|price)\b/i
export const BATCH_LINE  = /\b(?:batch|b\.?no|lot)\b/i
export const EXPIRY_LINE = /\b(?:exp|expiry|mfg|manufactured)\b/i
export const AMOUNT      = /(?:rs\.?|inr|npr|₹)?\s*([0-9]+(?:[.,][0-9]{1,2})?)/i
// mm/yy, mm-yy, mm/yyyy — common expiry-date shapes on pharma packaging.
export const DATE_LIKE   = /\b(0[1-9]|1[0-2])\s*[\/\-]\s*(\d{2}|\d{4})\b/

export function cleanLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim()
}

/**
 * Extract a price-looking number from a line such as "MRP: Rs. 120.50"
 * or "M.R.P Rs 45/-". Returns null if nothing plausible is found.
 */
export function extractAmount(line: string): number | null {
  const match = line.match(AMOUNT)
  if (!match) return null
  const num = parseFloat(match[1].replace(',', '.'))
  if (isNaN(num) || num <= 0 || num > 1_000_000) return null
  return num
}

export function parseProductOcr(rawText: string): ParsedProductFields {
  const lines = rawText
    .split('\n')
    .map(cleanLine)
    .filter(l => l.length > 1 && !NOISE_LINE.test(l))

  const result: ParsedProductFields = {}

  // ── MRP: look for a line explicitly mentioning MRP/Price first ──────────
  for (const line of lines) {
    if (MRP_LINE.test(line)) {
      const amount = extractAmount(line)
      if (amount != null) { result.mrp = amount; break }
    }
  }

  // ── Company name: a line matching common manufacturer keywords ──────────
  const companyLine = lines.find(l => {
    const lower = l.toLowerCase()
    return COMPANY_HINTS.some(hint => lower.includes(hint))
  })
  if (companyLine) {
    result.company_name = companyLine
  }

  // ── Product name: the first "real" line that isn't MRP/batch/expiry/
  //    company text and has some letters in it — usually the largest,
  //    topmost text on a label is the brand/product name. ──────────────────
  const candidateLines = lines.filter(l =>
    l !== companyLine &&
    !MRP_LINE.test(l) && !BATCH_LINE.test(l) && !EXPIRY_LINE.test(l) &&
    /[a-zA-Z]{3,}/.test(l)
  )
  if (candidateLines.length > 0) {
    result.name = candidateLines[0]
  }

  // ── Generic name: often the second candidate line, frequently written
  //    in parentheses or after the brand name (e.g. "Paracetamol 500mg"). ──
  if (candidateLines.length > 1) {
    result.generic_name = candidateLines[1]
  }

  return result
}
