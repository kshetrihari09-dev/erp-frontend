// Stand-in for UnifiedProductInput: Enter on a typed value "resolves" a product with that id ("NOPE" = not found).
import { forwardRef, useImperativeHandle } from 'react'
const Stub = forwardRef<any, any>((props, ref) => {
  useImperativeHandle(ref, () => ({ focus() {}, focusSilently() {} }))
  return <input aria-label="scan" onKeyDown={(e: any) => {
    if (e.key !== 'Enter') return
    const v = e.target.value
    if (v === 'NOPE') props.onNotFound?.(v); else props.onProductResolved({ id: v, name: v })
  }} />
})
export default Stub
