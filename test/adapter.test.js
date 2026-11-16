import test from 'node:test'
import assert from 'node:assert/strict'
import { createGatewayAdapter } from '../src/adapter.js'

const model = { id: 'model', name: 'Model', contextWindow: 10000, maxTokens: 500, inputModalities: ['text', 'image'], reasoningEfforts: { low: 'low', high: 'high' } }
const snapshot = (baseURL, policy = {}) => ({ baseURL, authIdentity: { type: 'none' }, modelSelection: {}, policy, models: [model] })
const published = (adapter) => adapter.config.profiles().get('CLIProxyAPI').piProvider.getAllModels()

test('adapter preserves model capabilities and captured generation', async () => {
  const ctx = { credentials: {}, get: () => undefined }
  const { adapter, update } = createGatewayAdapter(ctx, { ...snapshot('https://one.invalid/v1'), policy: { retryPolicy: { mode: 'normal', maxRetries: 2 } } }, [])
  assert.equal(adapter.providerRetryPolicy('CLIProxyAPI').maxRetries, 2)
  const prepared = await adapter.prepareCall('CLIProxyAPI', 'model')
  assert.deepEqual(prepared.model.inputModalities, ['text', 'image'])
  update(snapshot('https://two.invalid/v1'))
  assert.equal(adapter.providerRetryPolicy('CLIProxyAPI').maxRetries, 8)
  assert.equal(prepared.model.id, 'model')
  assert.equal((await adapter.resolveModel('CLIProxyAPI', 'model')).id, 'model')
})

test('adapter publishes the selected wire protocol and defaults to Responses', async () => {
  const ctx = { credentials: {}, get: () => undefined }
  const { adapter, update } = createGatewayAdapter(ctx, snapshot('https://one.invalid/v1'), [])
  assert.equal(published(adapter)[0].api, 'openai-responses')
  for (const api of ['openai-completions', 'anthropic-messages', 'google-generative-ai']) {
    update(snapshot('https://one.invalid/v1', { api }))
    assert.equal(published(adapter)[0].api, api)
  }
  update(snapshot('https://one.invalid/v1', { api: 'not-a-protocol' }))
  assert.equal(published(adapter)[0].api, 'openai-responses')
})

// Each SDK appends its own path, so the published base must differ per protocol
// even though the stored endpoint stays exactly what the user typed.
test('adapter publishes the base each protocol needs and keeps the stored one', async () => {
  const ctx = { credentials: {}, get: () => undefined }
  const { adapter, update } = createGatewayAdapter(ctx, snapshot('https://one.invalid'), [])
  const expected = {
    'openai-responses': 'https://one.invalid/v1',
    'openai-completions': 'https://one.invalid/v1',
    'anthropic-messages': 'https://one.invalid',
    'google-generative-ai': 'https://one.invalid/v1beta',
  }
  for (const [api, baseUrl] of Object.entries(expected)) {
    update(snapshot('https://one.invalid', { api }))
    assert.equal(published(adapter)[0].baseUrl, baseUrl, api)
  }
  // A connection saved by an older build with a trailing /v1 keeps the stored
  // value and still derives the same request base.
  update(snapshot('https://one.invalid/v1', { api: 'anthropic-messages' }))
  assert.equal(adapter.config.profiles().get('CLIProxyAPI').baseURL, 'https://one.invalid')
  assert.equal(published(adapter)[0].baseUrl, 'https://one.invalid')
  update(snapshot('https://one.invalid/v1', { api: 'openai-completions' }))
  assert.equal(published(adapter)[0].baseUrl, 'https://one.invalid/v1')
})

// pi-ai never pulses its idle watchdog, so the budget counts silence since the
// last streamed event. A gateway that thinks before its first token, or a
// middleware that only sends keep-alive comments, would hit a short budget
// while the core path (which re-arms on every chunk) would not. The default
// therefore matches the core's DEFAULT_STREAM_IDLE_TIMEOUT_MS.
test('adapter keeps the core idle budget and still honours an explicit one', async () => {
  const ctx = { credentials: {}, get: () => undefined }
  const { adapter, update } = createGatewayAdapter(ctx, snapshot('https://one.invalid/v1'), [])
  assert.equal(adapter.config.profiles().get('CLIProxyAPI').streamIdleTimeoutMs, 300000)
  update(snapshot('https://one.invalid/v1', { streamIdleTimeoutMs: 45000 }))
  assert.equal(adapter.config.profiles().get('CLIProxyAPI').streamIdleTimeoutMs, 45000)
  update(snapshot('https://one.invalid/v1'))
  assert.equal(adapter.config.profiles().get('CLIProxyAPI').streamIdleTimeoutMs, 300000)
})

// CLIProxyAPI returns thinking blocks without a signature. pi-ai turns an
// unsigned thinking block into plain assistant text when the history is
// replayed, so the model reads its own plan in the text channel and keeps
// writing plans as text instead of reasoning. Replaying the empty signature
// keeps reasoning in the thinking channel. policy.compat and model.compat can
// still override the default in either direction.
test('adapter replays an empty thinking signature instead of demoting reasoning to text', async () => {
  const ctx = { credentials: {}, get: () => undefined }
  const { adapter, update } = createGatewayAdapter(ctx, snapshot('https://one.invalid/v1'), [])
  assert.equal(published(adapter)[0].compat.allowEmptySignature, true)
  update(snapshot('https://one.invalid/v1', { compat: { allowEmptySignature: false } }))
  assert.equal(published(adapter)[0].compat.allowEmptySignature, false)
  update(snapshot('https://one.invalid/v1'))
  assert.equal(published(adapter)[0].compat.allowEmptySignature, true)
})

// A compressing middleware in front of the gateway admits only a couple of
// large request bodies and answers 503 until one finishes. The core's default
// five attempts capped at ten seconds can expire inside that window, so the
// gateway path retries longer unless the policy says otherwise.
test('adapter retries past a busy gateway window by default', async () => {
  const ctx = { credentials: {}, get: () => undefined }
  const { adapter, update } = createGatewayAdapter(ctx, snapshot('https://one.invalid/v1'), [])
  const policy = adapter.providerRetryPolicy('CLIProxyAPI')
  assert.equal(policy.maxRetries, 8)
  assert.equal(policy.initialDelayMs, 1000)
  assert.equal(policy.maxDelayMs, 20000)
  assert.ok(policy.retryableCodes.includes('SERVER'))
  update(snapshot('https://one.invalid/v1', { retryPolicy: { mode: 'normal', maxRetries: 1 } }))
  assert.equal(adapter.providerRetryPolicy('CLIProxyAPI').maxRetries, 1)
})
