/**
 * pharmaOcrParser.ts
 *
 * Classifies a structured ML Kit Text Recognition v2 result (blocks/lines,
 * each with a bounding box) into the pharmaceutical fields the live
 * scanner cares about: product/brand name, generic/composition, strength,
 * dosage form, manufacturer, MRP, batch number, and expiry date.
 *
 * This is the ML-Kit-specific counterpart to parseProductOcr.ts (which
 * works off a single raw Tesseract string for the New Product form) —
 * it reuses parseProductOcr's regexes/constants (COMPANY_HINTS, MRP_LINE,
 * BATCH_LINE, EXPIRY_LINE, AMOUNT, DATE_LIKE, extractAmount, cleanLine)
 * rather than duplicating them, and defers to ocrMatch.ts's
 * normalizeOcrText/extractStrength/detectDosageForm for text cleanup and
 * strength/dosage-form vocabulary — same reasoning as the spec's
 * "do not duplicate matching logic" requirement.
 *
 * Deliberately best-effort: real packaging is noisy and lines don't
 * always appear in a predictable order, so this only classifies what it's
 * reasonably confident about (line-level keyword/pattern hits) and always
 * leaves the actual decision to the database-aware fuzzy matching in
 * ocrMatch.ts — the parsed fields here are supporting evidence, not a
 * requirement for a perfect read.
 */

import type { MlKitOcrResult, MlKitLine } from '@/plugins/MlKitOcr'
import {
  COMPANY_HINTS, NOISE_LINE, MRP_LINE, BATCH_LINE, EXPIRY_LINE, AMOUNT, DATE_LIKE,
  cleanLine, extractAmount,
} from './parseProductOcr'
import { normalizeOcrText, extractStrength, detectDosageForm } from './ocrMatch'

export interface ParsedPharmaFields {
  productName?:  string
  genericName?:  string
  strength?:     string   // normalized, e.g. "500mg"
  dosageForm?:   string   // canonical form, e.g. "tablet"
  manufacturer?: string
  mrp?:          number
  batchNo?:      string
  expiryDate?:   string
  rawText:       string
}

const BATCH_TOKEN = /\b(?:batch|b\.?no\.?|lot)\s*[:#\-]?\s*([A-Za-z0-9\-\/]{2,15})\b/i

function extractBatchNo(line: string): string | null {
  const m = line.match(BATCH_TOKEN)
  return m ? m[1].toUpperCase() : null
}

function extractExpiry(line: string): string | null {
  const m = line.match(DATE_LIKE)
  return m ? `${m[1]}/${m[2]}` : null
}

// Flattens ML Kit's blocks/lines into a single list, ordered top-to-
// bottom (then left-to-right) by bounding box — packaging text is almost
// always laid out that way, and the brand/product name is conventionally
// the topmost/largest text.
function orderedLines(result: MlKitOcrResult): MlKitLine[] {
  const lines = result.lines && result.lines.length > 0
    ? result.lines
    : result.blocks.flatMap(b => b.lines)
  return [...lines].sort((a, b) => {
    const dy = a.boundingBox.top - b.boundingBox.top
    if (Math.abs(dy) > 8) return dy
    return a.boundingBox.left - b.boundingBox.left
  })
}

function lineArea(line: MlKitLine): number {
  return line.boundingBox.width * line.boundingBox.height
}

export function parseMlKitResult(result: MlKitOcrResult): ParsedPharmaFields {
  const rawText = result.text || ''
  const fields: ParsedPharmaFields = { rawText }
  if (!rawText.trim()) return fields

  const lines = orderedLines(result)
    .map(l => ({ ...l, text: cleanLine(l.text) }))
    .filter(l => l.text.length > 1 && !NOISE_LINE.test(l.text))

  const consumed = new Set<number>()

  // ── MRP ────────────────────────────────────────────────────────────────
  lines.forEach((line, i) => {
    if (fields.mrp == null && MRP_LINE.test(line.text)) {
      const amount = extractAmount(line.text)
      if (amount != null) { fields.mrp = amount; consumed.add(i) }
    }
  })

  // ── Batch number ─────────────────────────────────────────────────────────
  lines.forEach((line, i) => {
    if (fields.batchNo == null && BATCH_LINE.test(line.text)) {
      const batch = extractBatchNo(line.text)
      if (batch) { fields.batchNo = batch; consumed.add(i) }
    }
  })

  // ── Expiry date ────────────────────────────────────────────────────────
  lines.forEach((line, i) => {
    if (fields.expiryDate == null && (EXPIRY_LINE.test(line.text) || DATE_LIKE.test(line.text))) {
      const expiry = extractExpiry(line.text)
      if (expiry) { fields.expiryDate = expiry; consumed.add(i) }
    }
  })

  // ── Manufacturer ───────────────────────────────────────────────────────
  lines.forEach((line, i) => {
    if (fields.manufacturer == null && !consumed.has(i)) {
      const lower = line.text.toLowerCase()
      if (COMPANY_HINTS.some(hint => lower.includes(hint))) {
        fields.manufacturer = line.text
        consumed.add(i)
      }
    }
  })

  // ── Dosage form + strength ─────────────────────────────────────────────
  // Checked across the whole text (not line-by-line) since strength often
  // sits right next to the product name on the same line, and dosage form
  // is frequently a separate short line ("TABLETS") elsewhere on the pack.
  fields.strength = extractStrength(rawText) || undefined
  fields.dosageForm = detectDosageForm(rawText) || undefined
  lines.forEach((line, i) => {
    if (!consumed.has(i) && detectDosageForm(line.text) && line.text.split(' ').length <= 3) {
      // A short, dedicated dosage-form line ("Tablets", "Oral Suspension")
      // is packaging boilerplate, not part of the product name — drop it
      // from the name-candidate pool too.
      consumed.add(i)
    }
  })

  // ── Product name / generic name ─────────────────────────────────────────
  // Remaining, unconsumed, sufficiently-alphabetic lines, largest area
  // first (a bigger bounding box on a label is almost always the more
  // prominent brand text) — falls back to top-to-bottom order for ties.
  const candidateLines = lines
    .map((l, i) => ({ ...l, i }))
    .filter(l => !consumed.has(l.i) && /[a-zA-Z]{3,}/.test(l.text))
    .sort((a, b) => lineArea(b) - lineArea(a))

  if (candidateLines.length > 0) fields.productName = candidateLines[0].text
  if (candidateLines.length > 1) fields.genericName = candidateLines[1].text

  // Fall back to the un-parsed whole text for name matching if nothing
  // survived classification (e.g. a single-line crop) — normalizeOcrText
  // downstream handles noisy input fine either way.
  if (!fields.productName) fields.productName = normalizeOcrText(rawText).length > 0 ? rawText : undefined

  return fields
}
