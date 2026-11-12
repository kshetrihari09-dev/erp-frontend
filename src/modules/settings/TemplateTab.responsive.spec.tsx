/**
 * Printing settings (TemplateTab) — structure the responsive CSS relies on. Layout itself needs a real browser (see the
 * @container rules in globals.css); this guards the DOM contract: a width-aware host, a Settings | Preview switch that
 * drives `data-view`, and a scaled paper inside a sizer (so print, which clones only the invoice node, stays untouched).
 */
import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import TemplateTab from './TemplateTab'

describe('TemplateTab responsive structure', () => {
  test('is wrapped in a container-query host and starts on the Settings pane', () => {
    const { container } = render(<TemplateTab />)
    const host = container.querySelector('.tpl-host') as HTMLElement
    expect(host).toBeTruthy(); expect(host.dataset.view).toBe('settings')
    expect(host.querySelector('.tpl-layout')).toBeTruthy()
  })

  test('the Settings | Preview tabs switch the visible pane', () => {
    const { container } = render(<TemplateTab />)
    const host = container.querySelector('.tpl-host') as HTMLElement
    fireEvent.click(screen.getByRole('tab', { name: /preview/i }))
    expect(host.dataset.view).toBe('preview'); expect(screen.getByRole('tab', { name: /preview/i }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('tab', { name: /settings/i }))
    expect(host.dataset.view).toBe('settings')
  })

  test('the invoice sits inside sizer > paper (transform wrapper) and the toolbar actions stay reachable', () => {
    const { container } = render(<TemplateTab />)
    expect(container.querySelector('.tpl-preview-scroll .tpl-preview-sizer .tpl-preview-paper')).toBeTruthy()
    expect(screen.getByRole('button', { name: /test print/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /reset/i })).toBeTruthy()
  })

  test('stylesheet: stacking is container-driven, tabs are hidden by default, and the Settings shell stretches in column mode', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../styles/globals.css'), 'utf8')
    expect(css).toMatch(/\.tpl-host\s*\{[^}]*container-type:\s*inline-size/)
    expect(css).toMatch(/@container tpl \(max-width: 859px\)/)
    expect(css).toMatch(/\.tpl-tabs\s*\{\s*display:\s*none/)
    expect(css).toMatch(/\.stp-shell\s*\{\s*flex-direction:\s*column;\s*align-items:\s*stretch/)
  })
})
