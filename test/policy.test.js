import test from 'node:test'
import assert from 'node:assert/strict'
import { validatePolicy } from '../src/policy.js'

test('policy uses the public native schema for nested compatibility values', () => {
  assert.throws(() => validatePolicy({ compat: { supportsMaxOutputTokens: 'false' } }), { code: 'INVALID_POLICY' })
  assert.throws(() => validatePolicy({ compat: { supportsStrictMode: 123 } }), { code: 'INVALID_POLICY' })
  assert.doesNotThrow(() => validatePolicy({ compat: { supportsStrictMode: true, supportsMaxOutputTokens: false }, cacheRetention: 'short' }))
})
