/**
 * amountInWords.ts — "Three Thousand Six Hundred Eighty-seven" style number → words.
 *
 * Nepali grouping (Thousand → Lakh → Crore → Arab), matching the en-IN number formatting used
 * across the app. Paisa (fraction) is appended as "and Paisa Fifty" when non-zero.
 * Used by the pharma invoice layout's "Inwords Rs. … Only." line.
 */
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven',
  'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

/** 0–99 → "Eighty-seven" */
function below100(n: number): string {
  if (n < 20) return ONES[n]
  const t = TENS[Math.floor(n / 10)]
  const o = n % 10
  return o ? `${t}-${ONES[o].toLowerCase()}` : t
}

/** 0–999 → "Six Hundred Eighty-seven" */
function below1000(n: number): string {
  const h = Math.floor(n / 100)
  const r = n % 100
  return [h ? `${ONES[h]} Hundred` : '', r ? below100(r) : ''].filter(Boolean).join(' ')
}

function wholeToWords(n: number): string {
  if (n === 0) return 'Zero'
  const parts: string[] = []
  const arab  = Math.floor(n / 1_000_000_000); n %= 1_000_000_000
  const crore = Math.floor(n / 10_000_000);    n %= 10_000_000
  const lakh  = Math.floor(n / 100_000);       n %= 100_000
  const thou  = Math.floor(n / 1_000);         n %= 1_000
  if (arab)  parts.push(`${below1000(arab)} Arab`)
  if (crore) parts.push(`${below100(crore)} Crore`)
  if (lakh)  parts.push(`${below100(lakh)} Lakh`)
  if (thou)  parts.push(`${below100(thou)} Thousand`)
  if (n)     parts.push(below1000(n))
  return parts.join(' ')
}

/** 3687 → "Three Thousand Six Hundred Eighty-seven"; 3687.5 → "… and Paisa Fifty". Sign is ignored. */
export function amountInWords(amount: number | string | null | undefined): string {
  const abs = Math.abs(Number(amount) || 0)
  const cents = Math.round(abs * 100)
  const whole = Math.floor(cents / 100)
  const paisa = cents % 100
  const w = wholeToWords(whole)
  return paisa ? `${w} and Paisa ${below100(paisa)}` : w
}
