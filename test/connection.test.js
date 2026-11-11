import test from 'node:test'
import assert from 'node:assert/strict'
import { saveConnection, validateEndpoint } from '../src/connection.js'

function services(value = {}) {
  let state = { ns: 'llm-cliproxyapi', value, revision: 0 }
  const records = new Map()
  const writes = []
  return {
    records, writes,
    settings: {
      describe: () => [structuredClone(state)],
      async mutate(ns, ops, revision) {
        assert.equal(ns, 'llm-cliproxyapi')
        assert.equal(revision, state.revision)
        writes.push(ops)
        state = { ...state, value: { ...state.value, ...Object.fromEntries(ops.map((op) => [op.path[0], op.value])) }, revision: revision + 1 }
      },
    },
    credentials: {
      async readRecord(key) { return records.get(key) },
      async modifyRecord(key, fn) { const next = await fn(records.get(key)); if (next) records.set(key, next); return records.get(key) },
    },
  }
}

test('one CAS publishes the full connection draft and excludes the secret', async () => {
  const s = services({ modelSelection: { absent: false } })
  const result = await saveConnection(s.settings, s.credentials, {
    expectedRevision: 0, operationId: 'first', baseURL: 'https://example.invalid/v1',
    authEdit: { type: 'replace', key: 'fixture-secret' }, policy: { mode: 'normal' }, selectionChanges: { model: true },
  })
  assert.equal(result.revision, 1)
  assert.equal(s.writes.length, 1)
  const value = s.settings.describe()[0].value
  assert.deepEqual(value.modelSelection, { absent: false, model: true })
  assert.equal(value.operationId, 'first')
  assert.equal(value.authIdentity.type, 'record')
  assert.equal(JSON.stringify(value).includes('fixture-secret'), false)
  assert.equal(s.records.get(value.authIdentity.key).key, 'fixture-secret')
})

test('rejects endpoint change with retained key without explicit consent', async () => {
  const s = services({ baseURL: 'https://old.invalid/v1', authIdentity: { type: 'reference', ref: 'EXAMPLE_KEY' } })
  await assert.rejects(saveConnection(s.settings, s.credentials, { expectedRevision: 0, operationId: 'next', baseURL: 'https://new.invalid/v1', authEdit: { type: 'keep' } }), { code: 'AUTH_REUSE_REQUIRED' })
  assert.equal(s.writes.length, 0)
})

test('endpoint validation rejects credentials and secret query values', () => {
  for (const url of ['ftp://example.invalid/v1', 'https://user:pass@example.invalid/v1', 'https://example.invalid/v1#fragment', 'https://example.invalid/v1?api_key=x']) {
    assert.throws(() => validateEndpoint(url), { code: 'INVALID_URL' })
  }
  assert.equal(validateEndpoint('http://127.0.0.1:8317/v1'), 'http://127.0.0.1:8317/v1')
})

test('reconciles an ambiguous commit by operation ID without publishing twice', async () => {
  const s = services()
  const original = s.settings.mutate
  s.settings.mutate = async (...args) => { await original(...args); throw new Error('ack lost') }
  const draft = { expectedRevision: 0, operationId: 'lost-ack', baseURL: 'https://example.invalid/v1', authEdit: { type: 'none' }, policy: {}, selectionChanges: { model: false } }
  assert.equal((await saveConnection(s.settings, s.credentials, draft)).revision, 1)
  assert.equal((await saveConnection(s.settings, s.credentials, draft)).revision, 1)
  assert.equal(s.writes.length, 1)
  await assert.rejects(saveConnection(s.settings, s.credentials, { ...draft, baseURL: 'https://different.invalid/v1' }), { code: 'OPERATION_CONFLICT' })
})

test('unknown write does not claim success or delete a staged record', async () => {
  const s = services()
  s.settings.mutate = async () => { throw new Error('disconnected') }
  await assert.rejects(saveConnection(s.settings, s.credentials, { expectedRevision: 0, operationId: 'unknown', baseURL: 'https://example.invalid/v1', authEdit: { type: 'replace', key: 'fixture-secret' } }), { code: 'UNKNOWN' })
  assert.equal(s.records.size, 1)
  assert.equal(s.settings.describe()[0].revision, 0)
})
