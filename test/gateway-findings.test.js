import test from 'node:test'
import assert from 'node:assert/strict'
import { installGateway } from '../src/gateway.js'

function harness(discover, initial = {}) {
  let row = { ns: 'llm-cliproxyapi', revision: 0, value: initial }
  const routes = new Map(), timers = new Map(), events = new Map()
  let nextTimer = 0, dispose
  const ctx = {
    settings: {
      describe: () => [structuredClone(row), { ns: 'llm-pi-ai', revision: 0, value: { providers: {} }, user: { providers: {} } }],
      async mutate(_ns, ops, revision) {
        if (revision !== row.revision) throw Object.assign(new Error('conflict'), { code: 'SETTINGS_CONFLICT' })
        const value = structuredClone(row.value)
        for (const op of ops) { if (op.op === 'set') value[op.path[0]] = structuredClone(op.value); else delete value[op.path[0]] }
        row = { ...row, revision: row.revision + 1, value }
      },
    },
    credentials: { async resolve() { return undefined }, async readRecord() { return undefined } },
    llm: { registerAdapter() { const release = () => { }; release.replace = () => { }; return release } },
    inject(_services, fn) { fn({ connection: { fetch: { register(route) { routes.set(route.path, route) } } } }) },
    on(event, fn) { events.set(event, fn) }, effect(fn) { dispose = fn() },
    timeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return () => timers.delete(id) },
    get() { },
  }
  installGateway(ctx, () => ({ refreshIntervalMs: 0, retryInitialMs: 10, retryMaxMs: 40 }), discover, (request) => request.json(), async () => '')
  const post = async (body) => {
    const response = await routes.get('/api/cliproxyapi/command').fetch(new Request('http://local/api/cliproxyapi/command', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
    return response.json()
  }
  return { post, timers, dispose: () => dispose(), row: () => row }
}
const model = { id: 'fixture', name: 'fixture', input: ['text'], inputModalities: ['text'], contextWindow: 1000, maxTokens: 100, catalogMetadata: {} }

test('invalid policy never stages a key or writes settings', async () => {
  const h = harness(async () => ({ discovery: [model] }))
  const reply = await h.post({ type: 'save-connection', expectedRevision: 0, operationId: 'invalid', baseURL: 'https://fixture.invalid/v1', authEdit: { type: 'replace', key: 'never-echo-this' }, policy: { retryPolicy: { mode: 'normal', maxRetries: -1 } } })
  assert.equal(reply.error.code, 'INVALID_POLICY')
  assert.equal(h.row().revision, 0)
  assert.equal(JSON.stringify(reply).includes('never-echo-this'), false)
  h.dispose()
})

test('catalog failure schedules capped retry even with periodic refresh disabled', async () => {
  let calls = 0
  const h = harness(async () => { calls++; if (calls < 3) throw Object.assign(new Error('private body'), { code: 'CATALOG_TRANSPORT' }); return { discovery: [model] } })
  await Promise.resolve(); await Promise.resolve()
  const saved = await h.post({ type: 'save-connection', expectedRevision: 0, operationId: 'retry', baseURL: 'https://fixture.invalid/v1', authEdit: { type: 'none' }, policy: {} })
  assert.equal(saved.value.catalog.error.code, 'CATALOG_TRANSPORT')
  assert.equal(JSON.stringify(saved).includes('private body'), false)
  assert.equal([...h.timers.values()][0].delay, 10)
  const first = [...h.timers.values()][0]; h.timers.clear(); first.fn()
  for (let i = 0; i < 20 && calls < 2; i++) await Promise.resolve()
  await Promise.resolve(); await Promise.resolve()
  for (let i = 0; i < 20 && !h.timers.size; i++) await Promise.resolve()
  assert.equal([...h.timers.values()][0].delay, 20)
  const second = [...h.timers.values()][0]; h.timers.clear(); second.fn()
  for (let i = 0; i < 20 && calls < 3; i++) await Promise.resolve()
  h.dispose()
  assert.equal(h.timers.size, 0)
})
