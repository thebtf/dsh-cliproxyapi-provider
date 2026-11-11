import test from 'node:test'
import assert from 'node:assert/strict'
import { createGatewayAdapter } from '../src/adapter.js'

const model = { id: 'model', name: 'Model', contextWindow: 10000, maxTokens: 500, inputModalities: ['text', 'image'], reasoningEfforts: { low: 'low', high: 'high' } }
const snapshot = (baseURL) => ({ baseURL, authIdentity: { type: 'none' }, modelSelection: {}, policy: {}, models: [model] })

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
