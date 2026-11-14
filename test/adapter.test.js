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
  assert.equal(adapter.providerRetryPolicy('CLIProxyAPI').maxRetries, 5)
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
