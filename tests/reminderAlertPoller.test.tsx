// Integration: the real useReminderAlerts hook + singleton poller + auth store,
// rendered by React, with Node's mock timers. Counts actual notifications requests.
import './setup-dom'
import { test, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import React, { StrictMode } from 'react'
import { render, cleanup, act } from '@testing-library/react'
;(globalThis as any).localStorage = (globalThis as any).window.localStorage
import { calls, resetCalls, behavior } from './mock-api-notifications'
import useAuthStore from '../src/store/authStore'
import { useReminderAlerts } from '../src/hooks/useReminderAlerts'
import { reminderAlertPoller } from '../src/services/reminderAlertPoller'
import { resetRateLimitState } from '../src/services/rateLimitState'

// setImmediate is not mocked → drains the whole microtask queue (fetch → state → reschedule chain) deterministically.
const flush = () => new Promise<void>((r) => setImmediate(r))
async function advance(ms: number) { await act(async () => { await flush(); mock.timers.tick(ms); await flush() }) }
const login = (id = 'u1', company = 'c1') => useAuthStore.setState({ user: { id } as any, company: { id: company } as any, isAuthenticated: true })

function Probe({ label }: { label?: string }) {
  const { data } = useReminderAlerts()
  return <span data-label={label}>{data ? (data.data as unknown[]).length : 'none'}</span>
}

const realRandom = Math.random
beforeEach(() => { Math.random = () => 0.5 /* jitter-free, deterministic */; mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 2_000_000 }); resetCalls(); resetRateLimitState(); login() })
afterEach(() => { cleanup(); reminderAlertPoller.reset(); useAuthStore.setState({ isAuthenticated: false, user: null, company: null }); mock.timers.reset(); Math.random = realRandom })

test('request targets category=reminder&unread_only=true&limit=20 (API contract unchanged)', async () => {
  render(<Probe />); await advance(0)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].params, { category: 'reminder', unread_only: 'true', limit: 20 })
})

test('repeated re-renders do not create additional polling loops', async () => {
  const { rerender } = render(<Probe />)
  for (let i = 0; i < 25; i++) rerender(<Probe label={String(i)} />)
  await advance(0); assert.equal(calls.length, 1)
  await advance(60_000); assert.equal(calls.length, 2)
  await advance(60_000); assert.equal(calls.length, 3)
})

test('many components using the hook at once share ONE loop', async () => {
  render(<><Probe /><Probe /><Probe /><Probe /><Probe /></>)
  await advance(0); assert.equal(calls.length, 1)
  await advance(60_000); assert.equal(calls.length, 2)
  assert.equal(reminderAlertPoller.retainCount, 5)
})

test('repeated mount/unmount (route changes) never multiplies polling or refetches early', async () => {
  for (let i = 0; i < 8; i++) { const r = render(<Probe />); await advance(1_000); r.unmount() }
  assert.equal(calls.length, 1, '8 remounts within the interval → still a single request')
  const r = render(<Probe />)
  await advance(60_000); assert.equal(calls.length, 2)
  await advance(60_000); assert.equal(calls.length, 3)
  r.unmount()
})

test('React StrictMode double-mount (dev) creates one loop', async () => {
  render(<StrictMode><Probe /></StrictMode>); await advance(0)
  assert.equal(calls.length, 1)
  await advance(60_000); assert.equal(calls.length, 2)
})

test('unmounting the last consumer stops polling and clears the timer', async () => {
  const r = render(<><Probe /><Probe /></>); await advance(0)
  r.unmount()
  assert.equal(reminderAlertPoller.isRunning, false)
  await advance(10 * 60_000); assert.equal(calls.length, 1)
})

test('logout stops polling even if a consumer is still mounted, and clears alerts', async () => {
  behavior.next = () => ({ data: { success: true, data: [{ id: 'n1' }], pagination: {} } })
  const r = render(<Probe />); await advance(0)
  assert.equal(r.container.textContent, '1')
  await act(async () => { useAuthStore.getState().logout(); await flush() })
  assert.equal(reminderAlertPoller.isRunning, false)
  assert.equal(r.container.textContent, 'none')
  await advance(10 * 60_000); assert.equal(calls.length, 1)
})

test('unauthenticated render never polls', async () => {
  useAuthStore.setState({ user: null, company: null, isAuthenticated: false })
  render(<Probe />); await advance(10 * 60_000); assert.equal(calls.length, 0)
})

test('HTTP 429 with Retry-After is not retried until it elapses (no immediate retry, no tight loop)', async () => {
  behavior.next = (n: number) => { if (n === 1) throw { status: 429, original: { response: { status: 429, headers: { 'retry-after': '300' } } } }; return { data: { success: true, data: [], pagination: {} } } }
  render(<Probe />); await advance(0); assert.equal(calls.length, 1)
  await advance(299_000); assert.equal(calls.length, 1)
  await advance(1_000);   assert.equal(calls.length, 2)
})

test('switching company/user restarts for the new scope immediately without a second loop', async () => {
  render(<Probe />); await advance(0); assert.equal(calls.length, 1)
  await act(async () => { login('u1', 'c2'); await flush() }); await advance(0)
  assert.equal(calls.length, 2)
  await advance(60_000); assert.equal(calls.length, 3, 'still exactly one request per interval')
})
