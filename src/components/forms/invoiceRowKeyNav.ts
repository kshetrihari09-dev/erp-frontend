/**
 * Enter-as-Tab navigation for an invoice row (InvoiceRowsTable).
 *
 * Pure DOM logic, kept out of the component so it can be tested without React. Given a keydown inside a row it says where
 * focus should go, or `null` when the key is not ours to handle (the browser / the widget keeps its own behaviour).
 *
 * Rules
 *  - Enter  = Tab:        next editable <input> in the same row (Expiry → Qty → Bonus → Rate → Disc% → C.C %).
 *  - after the row's last input: the NEXT row's Product field; on the last row a new row is added first — but only if
 *    this row actually has a product, so Enter on an empty row can never pile up blank rows.
 *  - Shift+Enter = Shift+Tab: previous input; from the row's first input back to the row's Product field.
 *  - Never touched: the Product combobox (it uses Enter to pick the highlighted product), buttons (the Batch trigger
 *    opens its popup on Enter), the Batch popup (a portal — not inside the row's DOM), Ctrl/Cmd/Alt+Enter (page
 *    shortcuts), IME composition, and keys another handler already consumed.
 */
export type EnterNav =
  | { to: 'input'; el: HTMLInputElement }
  | { to: 'product'; row: 'self' | 'next' | 'new' }
  | { to: 'stay' }                                   // handled (Enter must not submit a form) but nowhere to go

export interface KeyLike {
  key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean
  defaultPrevented: boolean; isComposing?: boolean
}

const SKIP_TYPES = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'hidden', 'range', 'color'])

/** Inputs a user can type into, in DOM (= visual) order. The Product combobox is excluded: it is a stop of its own. */
export function editableInputs(rowEl: HTMLElement): HTMLInputElement[] {
  return Array.from(rowEl.querySelectorAll<HTMLInputElement>('input')).filter((el) =>
    !el.disabled && !el.readOnly && !SKIP_TYPES.has(el.type) && !el.classList.contains('psc-input') && el.tabIndex !== -1)
}

export function resolveEnterNav(
  e: KeyLike, target: HTMLElement, rowEl: HTMLElement | null,
  ctx: { isLastRow: boolean; rowHasProduct: boolean },
): EnterNav | null {
  if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing) return null
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  if (!rowEl || !rowEl.contains(target)) return null                        // portal content (Batch popup) etc.
  if (target.tagName !== 'INPUT') return null                               // buttons / textareas / selects keep Enter
  if (target.classList.contains('psc-input')) return null                   // Product combobox handles its own Enter

  const inputs = editableInputs(rowEl)
  const i = inputs.indexOf(target as HTMLInputElement)
  if (i === -1) return null                                                 // a checkbox, a hidden/readonly field…

  if (e.shiftKey) return i > 0 ? { to: 'input', el: inputs[i - 1] } : { to: 'product', row: 'self' }
  if (i < inputs.length - 1) return { to: 'input', el: inputs[i + 1] }
  if (!ctx.isLastRow) return { to: 'product', row: 'next' }
  return ctx.rowHasProduct ? { to: 'product', row: 'new' } : { to: 'stay' }
}
