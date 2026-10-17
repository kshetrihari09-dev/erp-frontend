import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyRateLimit, scopeForLimiter, scopeForUrl, cooldownRemainingMs, noteRateLimited, getRateLimitedUntil, resetRateLimitState,
} from '../src/services/rateLimitState'

beforeEach(() => resetRateLimitState())

test('classifyRateLimit: backend limiter / nginx / application / client / unknown infrastructure', () => {
  assert.deepEqual(classifyRateLimit({ 'x-ratelimit-source': 'app-limiter', 'x-ratelimit-limiter': 'user' }, { code: 'RATE_LIMITED' }), { kind: 'limiter', limiter: 'user', code: 'RATE_LIMITED' })
  assert.equal(classifyRateLimit({ 'X-RateLimit-Limiter': 'reports' }, undefined).kind, 'limiter')              // header names are case-insensitive
  assert.equal(classifyRateLimit({}, { code: 'RATE_LIMITED', limiter: 'ip' }).limiter, 'ip')                      // falls back to body
  assert.equal(classifyRateLimit({ 'x-ratelimit-source': 'nginx' }, undefined).kind, 'proxy')
  assert.equal(classifyRateLimit({ 'x-ratelimit-source': 'application' }, { code: 'PIN_LOCKED' }).kind, 'application')
  assert.equal(classifyRateLimit({}, { code: 'OTP_QUOTA_EXCEEDED' }).kind, 'application')                        // older backend without the marker header
  assert.equal(classifyRateLimit({ 'x-ratelimit-source': 'client' }, undefined).kind, 'client')
  assert.equal(classifyRateLimit({}, { code: 'CLIENT_RATE_LIMIT_COOLDOWN' }).kind, 'client')
  assert.equal(classifyRateLimit({}, '<html>Too Many Requests</html>').kind, 'unknown')                           // CDN / platform page
  assert.equal(classifyRateLimit(undefined, undefined).kind, 'unknown')
})

test('scopeForLimiter: baseline limiters are global, specialised limiters are scoped', () => {
  for (const l of ['user', 'company', 'ip', 'nginx', null]) assert.equal(scopeForLimiter(l as any), 'global')
  assert.equal(scopeForLimiter('auth_fail'), 'auth'); assert.equal(scopeForLimiter('otp_send'), 'auth'); assert.equal(scopeForLimiter('auth_sensitive'), 'auth')
  assert.equal(scopeForLimiter('reports'), 'reports'); assert.equal(scopeForLimiter('scanner'), 'scanner')
  assert.equal(scopeForLimiter('ocr_upload'), 'ocr'); assert.equal(scopeForLimiter('heavy_ops'), 'heavy')
})

test('scopeForUrl maps route families (with or without baseURL / query string)', () => {
  assert.equal(scopeForUrl('/reports/sales?from=1'), 'reports')
  assert.equal(scopeForUrl('/stock-register/export'), 'reports')
  assert.equal(scopeForUrl('/scanner/products/barcode/1'), 'scanner')
  assert.equal(scopeForUrl('/purchase-scans/abc'), 'ocr')
  assert.equal(scopeForUrl('/settings/backup/run'), 'heavy')
  assert.equal(scopeForUrl('/auth/login'), 'auth')
  assert.equal(scopeForUrl('/products'), null)
  assert.equal(scopeForUrl('/sales/reports-like'), null)
  assert.equal(scopeForUrl(undefined), null)
})

test('a scoped cooldown only holds back its own family; the global one holds back everything', () => {
  const t = 1_000_000
  noteRateLimited(30_000, t, 'reports')
  assert.equal(cooldownRemainingMs('/reports/sales', t + 1000), 29_000)
  assert.equal(cooldownRemainingMs('/products', t + 1000), 0)
  assert.equal(getRateLimitedUntil(), 0)                              // pollers (global) are NOT frozen by a rate-limited report
  assert.equal(getRateLimitedUntil('reports'), t + 30_000)
  noteRateLimited(10_000, t, 'global')
  assert.equal(cooldownRemainingMs('/products', t + 1000), 9_000)
  assert.equal(cooldownRemainingMs('/reports/sales', t + 1000), 29_000)   // later of global and scoped
})

test('cooldown never shrinks when a shorter one arrives', () => {
  noteRateLimited(60_000, 0); noteRateLimited(5_000, 0)
  assert.equal(getRateLimitedUntil(), 60_000)
})
