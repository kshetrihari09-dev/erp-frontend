// Stand-in for UnifiedProductInput (the barcode/search entry field): typing a product id or barcode and
// pressing Enter "resolves" the real mock product object — exactly what the real component hands
// the page via onProductResolved after a successful scan.
import { forwardRef, useImperativeHandle } from 'react'
import { PRODUCTS } from './mock-api-cc-sync'
const Stub = forwardRef<any, any>((props, ref) => {
  useImperativeHandle(ref, () => ({ focus() {}, focusSilently() {} }))
  return <input aria-label="scan" onKeyDown={(e: any) => {
    if (e.key !== 'Enter') return
    const v = e.target.value
    const p = PRODUCTS.find(x => x.id === v || x.barcode === v)
    if (p) props.onProductResolved(p); else props.onNotFound?.(v)
  }} />
})
export default Stub
