/**
 * utils/dateRangeShortcut.ts — Shift+D opens the date-range popup on ANY page.
 *
 * One global handler (hooks/useGlobalDateRangeShortcut, mounted once in AppLayout) looks at the page that is on screen,
 * finds its date-range filter and presses the filter's trigger button — exactly what a click does. The popup itself
 * has no `open` prop, so pressing the trigger is how it is opened.
 *
 * How the filter is found (first match wins, always inside the page content, never in the sidebar / top bar):
 *   1. an element marked  data-date-range  (explicit; best — see README: one attribute on DateRangeFilter's root
 *      makes every page that uses it work, with no guessing)
 *   2. a popup-trigger button whose label looks like a date range  ("All dates", "01 Jan – 31 Jan", "This month", …)
 *   3. a button with a calendar icon whose label looks like a date range
 * A single-date picker (an invoice date, a due date) is NOT a range and is never pressed.
 */

/** Shown in the hint next to the filter. */
export const DATE_RANGE_KEY_LABEL = 'Shift+D'
/** attribute that marks a date-range filter explicitly */
export const DATE_RANGE_ATTR = 'data-date-range'

const NOT_THE_TRIGGER = /clear|reset|remove|delete|\u00d7|\u2715|\u2716/i      // × ✕ ✖ (escaped so no build / file encoding can mangle them)

// What a date-range trigger shows: an empty label, a preset, or "from – to".
const RANGE_TEXT = new RegExp([
  String.raw`\b(all|any)\s+(dates?|time|period)\b`,
  String.raw`\b(select|choose|pick)\s+(a\s+|the\s+)?(date|dates|range|period)\b`,
  String.raw`\bdate\s*range\b`,
  String.raw`\b(today|yesterday)\b`,
  String.raw`\b(this|last|previous|current)\s+(week|month|quarter|year|fy|fiscal)\b`,
  String.raw`\blast\s+\d+\s+(days?|weeks?|months?)\b`,
  String.raw`\bfrom\b[\s\S]*\bto\b`,
  String.raw`\d[\s\S]*\s(?:\u2013|\u2014|-|\u2192|to)\s[\s\S]*\d`,            // "01 Jan - 31 Jan" (hyphen, en/em dash or arrow)
  String.raw`\d\s*[\u2013\u2014\u2192]\s*\d`,
].join('|'), 'i')

const accessibleText = (b: Element) => `${b.getAttribute('aria-label') ?? ''} ${b.getAttribute('title') ?? ''} ${b.textContent ?? ''}`.replace(/\s+/g, ' ').trim()

/** Does this text look like the label of a date-RANGE control (not a single date)? */
export function looksLikeDateRange(text: string): boolean {
  const t = String(text ?? '').trim()
  if (!t) return false
  if (/^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/.test(t)) return false          // one plain date
  return RANGE_TEXT.test(t)
}

const isVisible = (el: Element) => (el as HTMLElement).getClientRects().length > 0 && !(el as HTMLElement).hidden && !el.closest('[aria-hidden="true"], [hidden]')
const inOpenDialog = (el: Element) => !!el.closest('[role="dialog"], dialog')
const isUsable = (b: Element) => !(b as HTMLButtonElement).disabled && b.getAttribute('aria-disabled') !== 'true' && !NOT_THE_TRIGGER.test(accessibleText(b))
const buttonsIn = (root: ParentNode) => Array.from(root.querySelectorAll<HTMLElement>('button, [role="button"]'))
const isPopupTrigger = (b: Element) => b.hasAttribute('aria-haspopup') || b.hasAttribute('aria-expanded')
const hasCalendarIcon = (b: Element) => !!b.querySelector('svg[class*="calendar" i], [data-icon*="calendar" i], i[class*="calendar" i]')

/** The trigger button inside an element known to be the date-range filter (Clear / Reset buttons are never picked). */
export function pickTrigger(root: ParentNode | null | undefined): HTMLElement | null {
  if (!root) return null
  const buttons = buttonsIn(root).filter(isUsable)
  return buttons.find(isPopupTrigger) ?? buttons[0] ?? null
}

/** Find the date-range trigger on the page content inside `container`. */
export function findDateRangeTrigger(container: ParentNode | null | undefined): HTMLElement | null {
  if (!container) return null
  // 1. explicit marker
  for (const m of Array.from(container.querySelectorAll<HTMLElement>(`[${DATE_RANGE_ATTR}]`))) {
    if (!isVisible(m) || inOpenDialog(m)) continue
    const t = pickTrigger(m)
    if (t) return t
  }
  // 2 + 3. look at the buttons on the page
  const cands = buttonsIn(container).filter(b => isUsable(b) && isVisible(b) && !inOpenDialog(b) && looksLikeDateRange(accessibleText(b)))
  return cands.find(isPopupTrigger) ?? cands.find(hasCalendarIcon) ?? null
}

/** Press the date-range trigger inside `container`. Returns false when the page has no date-range filter. */
export function openDateRange(container: ParentNode | null | undefined): boolean {
  const t = findDateRangeTrigger(container)
  if (!t) return false
  t.click()
  return true
}

/** True while the focus is somewhere you type (so letter shortcuts must stay out of the way). */
export function isTypingTarget(t: unknown): boolean {
  const el = t as { tagName?: string; isContentEditable?: boolean; getAttribute?: (n: string) => string | null } | null
  if (!el || typeof el !== 'object') return false
  const tag = String(el.tagName ?? '').toUpperCase()
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable === true) return true
  const ce = el.getAttribute?.('contenteditable')
  return ce !== null && ce !== undefined && ce !== 'false'
}

/** Exactly Shift+D (either case, since Shift makes it “D”): no Ctrl / Alt / Meta, not auto-repeat, not mid-composition. */
export function isDateRangeKey(e: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey' | 'repeat' | 'isComposing'>): boolean {
  return e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && !e.repeat && !e.isComposing && String(e.key).toLowerCase() === 'd'
}

/** A modal dialog is open (the key then belongs to it, not to the page). A dialog that is only hidden does not count. */
export function isDialogOpen(doc: Document = document): boolean {
  return Array.from(doc.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"], dialog[open]')).some(d => !d.hidden && d.getClientRects().length > 0)
}

/**
 * keydown handler for Shift+D. `getContainer` returns the page-content element (so the sidebar and top bar are never
 * searched). It only acts when: the key is Shift+D, you are not typing, no modal dialog is open, and the page has a
 * date-range filter. On any other page the key is left alone.
 */
export function createDateRangeKeyHandler(getContainer: () => ParentNode | null | undefined) {
  return (e: KeyboardEvent) => {
    if (e.defaultPrevented || !isDateRangeKey(e) || isTypingTarget(e.target) || isDialogOpen()) return
    if (openDateRange(getContainer())) e.preventDefault()
  }
}
