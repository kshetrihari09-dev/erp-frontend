// Must be imported FIRST: gives react-dom / testing-library a browser-like global environment.
import { JSDOM } from 'jsdom'
const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost' })
const g = globalThis as any
g.window = dom.window; g.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
for (const k of ['HTMLElement', 'Node', 'MouseEvent', 'KeyboardEvent', 'Event', 'HTMLInputElement', 'getComputedStyle', 'MutationObserver', 'SVGElement', 'Element', 'CustomEvent', 'DocumentFragment', 'HTMLDivElement', 'HTMLButtonElement']) g[k] = (dom.window as any)[k]
g.IS_REACT_ACT_ENVIRONMENT = true
// extras used by framer-motion & layout code
g.window.matchMedia = g.window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
g.matchMedia = g.window.matchMedia
class NoopObserver { observe() {} unobserve() {} disconnect() {} }
g.ResizeObserver = g.window.ResizeObserver = NoopObserver; g.IntersectionObserver = g.window.IntersectionObserver = NoopObserver
g.requestAnimationFrame = g.window.requestAnimationFrame = (cb: any) => setTimeout(() => cb(Date.now()), 0)
g.cancelAnimationFrame = g.window.cancelAnimationFrame = (id: any) => clearTimeout(id)
