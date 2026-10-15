// Must be imported FIRST: gives react-dom / testing-library a browser-like global environment.
import { JSDOM } from 'jsdom'
const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost' })
const g = globalThis as any
g.window = dom.window; g.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
for (const k of ['HTMLElement', 'Node', 'MouseEvent', 'KeyboardEvent', 'Event', 'HTMLInputElement', 'getComputedStyle', 'MutationObserver']) g[k] = (dom.window as any)[k]
g.IS_REACT_ACT_ENVIRONMENT = true
