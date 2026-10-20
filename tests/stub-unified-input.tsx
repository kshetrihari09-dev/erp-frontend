// Stand-in for UnifiedProductInput: Enter on a typed value "resolves" a product with that id ("NOPE" = not found).
import { forwardRef, useImperativeHandle } from 'react'
const NAMES: Record<string, string> = { p1: 'Paracetamol 500', p2: 'Amoxicillin 250', p9: 'Never Bought' }
const Stub = forwardRef<any, any>((props, ref) => {
  useImperativeHandle(ref, () => ({ focus() {}, focusSilently() {} }))
  return <input aria-label="scan" onKeyDown={(e: any) => {
    if (e.key !== 'Enter') return
    const v = e.target.value
    if (v === 'NOPE') props.onNotFound?.(v); else props.onProductResolved({ id: v, name: NAMES[v] || v })
  }} />
})
export default Stub
