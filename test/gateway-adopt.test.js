import test from 'node:test'
import assert from 'node:assert/strict'
import { installGateway } from '../src/gateway.js'

const model = { id: 'fixture', name: 'fixture', input: ['text'], inputModalities: ['text'], contextWindow: 1000, maxTokens: 100, catalogMetadata: {} }

// Two real settings rows so the legacy llm-pi-ai provider can be adopted and
// removed exactly as the migration code expects.
function harness(discover, legacyProfile) {
  const rows = new Map([
    ['llm-cliproxyapi', { revision: 0, value: {} }],
    ['llm-pi-ai', { revision: 0, value: { providers: legacyProfile ? { CLIProxyAPI: structuredClone(legacyProfile) } : {} }, user: { providers: legacyProfile ? { CLIProxyAPI: structuredClone(legacyProfile) } : {} }, base: { providers: {} } }],
  ])
  const routes = new Map()
  let dispose
  const ctx = {
    settings: {
      describe: () => [...rows].map(([ns, row]) => ({ ns, ...structuredClone(row) })),
      async mutate(ns, ops, revision) {
        const row = rows.get(ns)
        if (revision !== row.revision) throw Object.assign(new Error('conflict'), { code: 'SETTINGS_CONFLICT' })
        const value = structuredClone(row.value)
        const user = row.user ? structuredClone(row.user) : undefined
        for (const op of ops) {
          for (const target of ns === 'llm-pi-ai' ? [value, user] : [value]) {
            let cursor = target
            for (const key of op.path.slice(0, -1)) cursor = cursor[key] ??= {}
            if (op.op === 'set') cursor[op.path.at(-1)] = structuredClone(op.value)
            else delete cursor[op.path.at(-1)]
          }
        }
        rows.set(ns, { ...row, revision: row.revision + 1, value, ...(user ? { user } : {}) })
      },
    },
    credentials: { async resolve() { return undefined }, async readRecord() { return undefined } },
    llm: { registerAdapter() { const release = () => { }; release.replace = () => { }; return release } },
    inject(_services, fn) { fn({ connection: { fetch: { register(route) { routes.set(route.path, route) } } } }) },
    on() { }, effect(fn) { dispose = fn() },
    timeout() { return () => { } },
    get() { },
  }
  installGateway(ctx, () => ({ refreshIntervalMs: 0, retryInitialMs: 10, retryMaxMs: 40 }), discover, (request) => request.json(), async () => '')
  const post = async (body) => {
    const response = await routes.get('/api/cliproxyapi/command').fetch(new Request('http://local/api/cliproxyapi/command', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
    return { status: response.status, body: await response.json() }
  }
  return { post, rows, dispose: () => dispose() }
}

const legacy = { api: 'openai-responses', baseURL: 'https://legacy.invalid/v1', apiKeyEnv: 'CPA_KEY', models: [{ id: 'old', input: ['text'] }] }

test('saving a first connection adopts the legacy provider instead of refusing the save', async () => {
  const h = harness(async () => ({ discovery: [model] }), legacy)
  const reply = await h.post({ type: 'save-connection', expectedRevision: 0, operationId: 'adopt', baseURL: 'https://fixture.invalid/v1', authEdit: { type: 'none' }, policy: {} })
  assert.equal(reply.status, 200, JSON.stringify(reply.body))
  assert.equal(reply.body.value.baseURL, 'https://fixture.invalid/v1')
  assert.equal(reply.body.value.legacy.available, false, 'the adopted provider must no longer be offered for import')
  assert.equal(h.rows.get('llm-pi-ai').value.providers.CLIProxyAPI, undefined, 'the legacy provider must be removed by the cutover')
  assert.equal(h.rows.get('llm-cliproxyapi').value.migration.phase, 'active', 'a successful refresh finishes the cutover')
  assert.equal(h.rows.get('llm-cliproxyapi').value.migration.backup.baseURL, 'https://legacy.invalid/v1', 'the cutover must stay reversible')
  h.dispose()
})

test('a legacy provider that cannot be adopted still refuses the save with its reason', async () => {
  const h = harness(async () => ({ discovery: [model] }), { ...legacy, headers: { 'X-Api-Key': 'sensitive' } })
  const reply = await h.post({ type: 'save-connection', expectedRevision: 0, operationId: 'blocked', baseURL: 'https://fixture.invalid/v1', authEdit: { type: 'none' }, policy: {} })
  assert.equal(reply.status, 409)
  assert.equal(reply.body.error.code, 'LEGACY_CONFLICT')
  assert.equal(JSON.stringify(reply.body).includes('sensitive'), false)
  assert.equal(h.rows.get('llm-cliproxyapi').revision, 0, 'a refused save must not write settings')
  h.dispose()
})

test('a rejected draft after adoption restores the legacy provider instead of stranding the route', async () => {
  const h = harness(async () => ({ discovery: [model] }), legacy)
  const reply = await h.post({ type: 'save-connection', expectedRevision: 0, operationId: 'rejected', baseURL: 'ftp://fixture.invalid/v1', authEdit: { type: 'none' }, policy: {} })
  assert.equal(reply.status, 400, JSON.stringify(reply.body))
  assert.equal(h.rows.get('llm-pi-ai').value.providers.CLIProxyAPI.baseURL, 'https://legacy.invalid/v1', 'the legacy provider must be restored')
  assert.equal(h.rows.get('llm-cliproxyapi').value.baseURL, undefined, 'the prepared migration must be undone')
  assert.equal(h.rows.get('llm-cliproxyapi').value.migration, undefined)
  h.dispose()
})
