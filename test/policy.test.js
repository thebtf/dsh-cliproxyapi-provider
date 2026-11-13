import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_PROTOCOL, PROTOCOLS, protocolOf, validatePolicy } from '../src/policy.js'

test('policy uses the public native schema for nested compatibility values', () => {
  assert.throws(() => validatePolicy({ compat: { supportsMaxOutputTokens: 'false' } }), { code: 'INVALID_POLICY' })
  assert.throws(() => validatePolicy({ compat: { supportsStrictMode: 123 } }), { code: 'INVALID_POLICY' })
  assert.doesNotThrow(() => validatePolicy({ compat: { supportsStrictMode: true, supportsMaxOutputTokens: false }, cacheRetention: 'short' }))
})

test('every supported wire protocol is a valid policy and anything else is refused', () => {
  assert.deepEqual(PROTOCOLS, ['openai-responses', 'openai-completions', 'anthropic-messages', 'google-generative-ai'])
  assert.equal(DEFAULT_PROTOCOL, 'openai-responses')
  for (const api of PROTOCOLS) assert.doesNotThrow(() => validatePolicy({ api }), api)
  for (const api of ['openai', 'responses', 'anthropic', '', null, 1]) assert.throws(() => validatePolicy({ api }), { code: 'INVALID_POLICY' }, String(api))
})

test('a policy without a protocol resolves to the default instead of failing', () => {
  assert.equal(protocolOf({}), DEFAULT_PROTOCOL)
  assert.equal(protocolOf(undefined), DEFAULT_PROTOCOL)
  assert.equal(protocolOf({ api: 'anthropic-messages' }), 'anthropic-messages')
  assert.equal(protocolOf({ api: 'not-a-protocol' }), DEFAULT_PROTOCOL)
})
