/**
 * htmlToPdfBlob.ts
 *
 * Converts an HTML element into a real PDF Blob, entirely client-side.
 * This is ADDITIVE — it does not replace, call, or modify the existing
 * `usePrint` / `downloadPDF` print pipeline (which opens the browser's
 * native print dialog and is left exactly as-is). This util exists
 * solely to produce a Blob the Cloud Storage backup feature can upload;
 * it is not used by the regular Print/Download buttons.
 *
 * Uses html2pdf.js (html2canvas + jsPDF under the hood), imported
 * dynamically so it doesn't add weight to the initial bundle — it only
 * loads when a user actually clicks "Backup to Cloud".
 */

export interface HtmlToPdfOptions {
  /** 'a4' | 'a5' | thermal widths — mirrors the existing PrintSize concept loosely. */
  paperSize?: 'a4' | 'a5' | 'letter'
  marginMm?: number
}

export async function htmlToPdfBlob(
  element: HTMLElement,
  options: HtmlToPdfOptions = {}
): Promise<Blob> {
  const { paperSize = 'a4', marginMm = 8 } = options

  // Dynamic import keeps this out of the main bundle until actually needed.
  const html2pdf = (await import('html2pdf.js')).default

  const opt = {
    margin: marginMm,
    filename: 'document.pdf', // overwritten by caller via the returned blob's filename on upload
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
    jsPDF: { unit: 'mm', format: paperSize === 'letter' ? 'letter' : paperSize, orientation: 'portrait' },
  }

  // html2pdf's worker API can output a Blob directly via .outputPdf('blob').
  const blob: Blob = await html2pdf()
    .set(opt)
    .from(element)
    .outputPdf('blob')

  return blob
}
