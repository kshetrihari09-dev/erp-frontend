/**
 * useKeyboardShortcuts.ts
 *
 * Centralized, reusable, TypeScript-safe keyboard shortcut manager for the
 * ERP, built for the Sale/Purchase POS-style workflows (F2..F10, Ctrl+
 * combos) but usable anywhere.
 *
 * How it works
 * ────────────
 * 1. One `keydown` listener per mounted `useKeyboardShortcuts()` call.
 *
 * 2. Scope stack — "topmost mounted scope wins".
 *    Every call (and every `useShortcutScope()` call) pushes an id onto a
 *    module-level stack while mounted+active. On keydown, only the TOPMOST
 *    scope may act. This is what makes opening a modal/popup automatically
 *    suspend the page's own shortcuts underneath it: the moment a modal
 *    with its own `useKeyboardShortcuts()` (or a bare `useShortcutScope()`)
 *    mounts, it becomes the topmost scope, so the Sale/Purchase page's
 *    F2..F10 handlers below it simply stop firing — no manual "is a modal
 *    open?" flag needs to be threaded through every page. When the modal
 *    unmounts, the page's scope is topmost again automatically.
 *
 * 3. Typing is never hijacked.
 *    Shortcuts are ignored while the event target is a text-entry element
 *    (<input> other than button/checkbox/radio/etc., <textarea>, or
 *    [contenteditable]) UNLESS the shortcut opts in via `allowInInput`.
 *    F-keys and Ctrl+combos default to `allowInInput: true` (that's the
 *    whole point of a POS keyboard workflow — e.g. pressing F8 to jump to
 *    Payment while the Qty field is focused), but plain letters/Enter/
 *    Arrow-key style combos default to `false`, so normal typing is safe.
 *
 * 4. Standard browser/editing shortcuts are never touched.
 *    Ctrl/Cmd+C, V, X, A, Z, Y (and Ctrl+Shift+Z) are matched and ignored
 *    outright — regardless of what's registered — so copy/paste/select-
 *    all/undo/redo always keep working.
 */

import { useEffect, useRef } from 'react'

export type ShortcutCombo = string // e.g. 'f2', 'ctrl+s', 'ctrl+enter', 'esc'

export interface ShortcutDef {
  /** Combo string, case-insensitive. Modifiers: ctrl (or cmd — treated the
   *  same), shift, alt. Keys: f1-f12, enter, esc/escape, arrowup/down/
   *  left/right, single letters/digits, etc. Example: 'ctrl+shift+enter'. */
  combo: ShortcutCombo
  handler: (e: KeyboardEvent) => void
  /** Human-readable label, for shortcut-hint UI (tooltips/menus/help). */
  description?: string
  /** Fire even while a text-entry element has focus. Defaults to true for
   *  F-keys and Ctrl+combos, false otherwise — see file header. */
  allowInInput?: boolean
  /** Skip preventDefault() (rare — most shortcuts should prevent the
   *  browser's own default action, e.g. Ctrl+P opening the print dialog). */
  passive?: boolean
}

// Never touched, no matter what's registered — copy/paste/select-all/undo/
// redo must always keep working exactly like standard browser behaviour.
const RESERVED_BROWSER_COMBOS = new Set([
  'ctrl+c', 'ctrl+v', 'ctrl+x', 'ctrl+a', 'ctrl+z', 'ctrl+y', 'ctrl+shift+z',
])

function normalizeKey(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('ctrl')
  if (e.shiftKey) parts.push('shift')
  if (e.altKey) parts.push('alt')
  let key = e.key.toLowerCase()
  if (key === 'escape') key = 'esc'
  if (key === ' ') key = 'space'
  parts.push(key)
  return parts.join('+')
}

function normalizeCombo(combo: string): string {
  const order = ['ctrl', 'shift', 'alt']
  return combo
    .toLowerCase()
    .split('+')
    .map(p => p.trim())
    .map(p => (p === 'cmd' ? 'ctrl' : p === 'escape' ? 'esc' : p))
    .sort((a, b) => {
      const ai = order.indexOf(a), bi = order.indexOf(b)
      if (ai === -1 && bi === -1) return 0
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
    .join('+')
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'TEXTAREA') return true
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color'].includes(type)
  }
  return target.isContentEditable
}

function defaultAllowInInput(combo: string): boolean {
  if (/^f\d{1,2}$/.test(combo)) return true
  if (combo.startsWith('ctrl+')) return true
  return false
}

/* ── Scope stack ──────────────────────────────────────────────────────── */
let scopeSeq = 0
const scopeStack: number[] = []

function pushScope(id: number) { scopeStack.push(id) }
function popScope(id: number) {
  const i = scopeStack.indexOf(id)
  if (i !== -1) scopeStack.splice(i, 1)
}
function isTopScope(id: number) { return scopeStack.length > 0 && scopeStack[scopeStack.length - 1] === id }

/**
 * Register presence in the shortcut scope stack WITHOUT binding any keys.
 * For components that already implement their own bespoke local key
 * handling (e.g. BatchSelectionPopup's arrow-key list navigation) but still
 * need to suspend page-level shortcuts underneath them while mounted/open.
 */
export function useShortcutScope(active = true): void {
  const idRef = useRef<number>()
  if (idRef.current === undefined) idRef.current = ++scopeSeq

  useEffect(() => {
    if (!active) return
    const id = idRef.current!
    pushScope(id)
    return () => popScope(id)
  }, [active])
}

export interface UseKeyboardShortcutsOptions {
  /** When false, this hook registers nothing and no handlers fire —
   *  equivalent to conditionally not calling the hook, without breaking
   *  the rules of hooks. */
  enabled?: boolean
}

/**
 * Bind a set of keyboard shortcuts for as long as the calling component is
 * mounted (and `enabled`). See file header for the full behaviour model.
 */
export function useKeyboardShortcuts(
  shortcuts: ShortcutDef[],
  options: UseKeyboardShortcutsOptions = {},
): void {
  const { enabled = true } = options
  const shortcutsRef = useRef(shortcuts)
  shortcutsRef.current = shortcuts

  const idRef = useRef<number>()
  if (idRef.current === undefined) idRef.current = ++scopeSeq

  useEffect(() => {
    if (!enabled) return
    const id = idRef.current!
    pushScope(id)

    function onKeyDown(e: KeyboardEvent) {
      if (!isTopScope(id)) return

      const pressed = normalizeKey(e)
      if (RESERVED_BROWSER_COMBOS.has(pressed)) return

      for (const s of shortcutsRef.current) {
        const combo = normalizeCombo(s.combo)
        if (combo !== pressed || RESERVED_BROWSER_COMBOS.has(combo)) continue

        const inTextField = isTextEntryTarget(e.target)
        const allow = s.allowInInput ?? defaultAllowInInput(combo)
        if (inTextField && !allow) continue

        if (!s.passive) e.preventDefault()
        s.handler(e)
        return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      popScope(id)
    }
  }, [enabled])
}
