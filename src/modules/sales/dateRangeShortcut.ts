/**
 * dateRangeShortcut.ts — open the "All Invoices" date-range popup from the keyboard.
 *
 *   Shift+D   (main shortcut — ignored while you are typing, so a capital “D” in the search box still types)
 *   F4        (also works while the search box has focus; registered through the shared useKeyboardShortcuts)
 *
 * The popup (`DateRangeFilter` in @/components/ui/DateRangePopup) opens when its trigger button is pressed and does
 * not expose an `open` prop, so the shortcut presses that trigger — exactly what a click does.
 */

/** Main shortcut, shown in the hint next to the filter. */
export const DATE_RANGE_KEY_LABEL = 'Shift+D'
/** Second shortcut for the shared shortcut manager (F-keys work even inside text boxes). */
export const DATE_RANGE_SHORTCUT = 'f4'

const NOT_THE_TRIGGER = /clear|reset|remove|delete|×|✕|✖/i

/**
 * Press the date-range trigger inside `root`. The trigger is the button that opens a popup; Clear / Reset buttons
 * (shown once a range is set) are never pressed. Returns false when there is no trigger to press.
 */
export function openDateRange(root: ParentNode | null | undefined): boolean {
  if (!root) return false
  const buttons = Array.from(root.querySelectorAll<HTMLElement>('button, [role="button"]')).filter(b =>
    !(b as HTMLButtonElement).disabled && b.getAttribute('aria-disabled') !== 'true' &&
    !NOT_THE_TRIGGER.test(`${b.getAttribute('aria-label') ?? ''} ${b.getAttribute('title') ?? ''} ${b.textContent ?? ''}`.trim()))
  const trigger = buttons.find(b => b.hasAttribute('aria-haspopup') || b.hasAttribute('aria-expanded')) ?? buttons[0]
  if (!trigger) return false
  trigger.click()
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

/** A popup / dialog is already open somewhere on the page (the key then belongs to it, not to the list). */
export function isDialogOpen(doc: Document = document): boolean {
  // a dialog that is only hidden (display:none / the hidden attribute) is not "open"
  return Array.from(doc.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"], dialog[open]')).some(d => !d.hidden && d.getClientRects().length > 0)
}

/**
 * keydown handler for the Shift+D shortcut. `getRoot` returns the element that wraps the date-range filter.
 * It only acts when: the key is Shift+D, you are not typing, no other dialog is open, and the filter is on screen.
 */
export function createDateRangeKeyHandler(getRoot: () => ParentNode | null | undefined) {
  return (e: KeyboardEvent) => {
    if (e.defaultPrevented || !isDateRangeKey(e) || isTypingTarget(e.target) || isDialogOpen()) return
    if (openDateRange(getRoot())) e.preventDefault()
  }
}
