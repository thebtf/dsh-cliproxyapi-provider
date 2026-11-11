import test from 'node:test'
import assert from 'node:assert/strict'
import { legacyView, prepareLegacy, cutoverLegacy, finishLegacy, rollbackLegacy } from '../src/migration.js'

function fixture() {
  const profile = { api: 'openai-responses', baseURL: 'https://legacy.invalid/v1', apiKeyEnv: 'CPA_KEY', models: [{ id: 'old', input: ['text'] }] }
  const own = { ns: 'llm-cliproxyapi', revision: 0, value: { modelSelection: { old: false } } }
  const legacy = { ns: 'llm-pi-ai', revision: 0, value: { providers: { CLIProxyAPI: profile } }, user: { providers: { CLIProxyAPI: profile } }, base: { providers: {} } }
  const settings = {
    describe: () => structuredClone([own, legacy]),
    async mutate(ns, ops, revision) {
      const row = ns === own.ns ? own : legacy
      if (revision !== row.revision) throw Object.assign(new Error('conflict'), { code: 'SETTINGS_CONFLICT' })
      for (const op of ops) {
        for (const container of ns === legacy.ns ? [row.value, row.user] : [row.value]) {
          let target = container
          for (const segment of op.path.slice(0, -1)) target = target[segment] ??= {}
          if (op.op === 'unset') delete target[op.path.at(-1)]
          else target[op.path.at(-1)] = structuredClone(op.value)
        }
      }
      row.revision++
    },
  }
  return { settings, own, legacy }
}

test('migration records intent before removing the user layer and finishes from cutover', async () => {
  const { settings, own, legacy } = fixture()
  const info = legacyView(settings)
  await prepareLegacy(settings, { expectedRevision: 0, expectedLegacyRevision: 0, fingerprint: info.fingerprint, operationId: 'import-one' })
  assert.equal(own.value.migration.phase, 'prepared')
  assert.ok(legacy.user.providers.CLIProxyAPI)
  assert.equal(own.value.modelSelection.old, false)
  await cutoverLegacy(settings)
  assert.equal(own.value.migration.phase, 'cutover')
  assert.equal(legacy.user.providers.CLIProxyAPI, undefined)
  assert.equal(await cutoverLegacy(settings), true)
  await finishLegacy(settings)
  assert.equal(own.value.migration.phase, 'active')
})

test('migration does not remove a base-layer provider or a competing edit', async () => {
  const f = fixture()
  f.legacy.base.providers.CLIProxyAPI = { baseURL: 'https://other.invalid/v1' }
  assert.equal(legacyView(f.settings).available, false)
  delete f.legacy.base.providers.CLIProxyAPI
  const info = legacyView(f.settings)
  await prepareLegacy(f.settings, { expectedRevision: 0, expectedLegacyRevision: 0, fingerprint: info.fingerprint, operationId: 'import-two' })
  f.legacy.user.providers.CLIProxyAPI.baseURL = 'https://changed.invalid/v1'
  await assert.rejects(cutoverLegacy(f.settings), { code: 'MIGRATION_CONFLICT' })
  assert.equal(f.own.value.migration.phase, 'prepared')
})

test('rollback refuses a changed generation and restores only an absent legacy layer', async () => {
  const f = fixture()
  const info = legacyView(f.settings)
  await prepareLegacy(f.settings, { expectedRevision: 0, expectedLegacyRevision: 0, fingerprint: info.fingerprint, operationId: 'rollback' })
  await cutoverLegacy(f.settings)
  const generation = f.own.value.generation
  f.own.value.generation = 'later-change'
  await assert.rejects(rollbackLegacy(f.settings, async () => { }), { code: 'MIGRATION_CONFLICT' })
  f.own.value.generation = generation
  let released = false
  await rollbackLegacy(f.settings, async () => { released = true })
  assert.equal(released, true)
  assert.equal(f.legacy.user.providers.CLIProxyAPI.baseURL, 'https://legacy.invalid/v1')
  assert.equal(f.own.value.baseURL, undefined)
})

test('rollback never consumes a concurrent connection revision', async () => {
  const f = fixture()
  const info = legacyView(f.settings)
  await prepareLegacy(f.settings, { expectedRevision: 0, expectedLegacyRevision: 0, fingerprint: info.fingerprint, operationId: 'race' })
  await cutoverLegacy(f.settings)
  let release
  let entered
  const started = new Promise((resolve) => { entered = resolve })
  const paused = new Promise((resolve) => { release = resolve })
  const rollback = rollbackLegacy(f.settings, async () => { entered(); await paused })
  await started
  await f.settings.mutate('llm-cliproxyapi', [
    { op: 'set', path: ['baseURL'], value: 'https://new.invalid/v1' },
    { op: 'set', path: ['generation'], value: 'new-generation' },
    { op: 'set', path: ['operationId'], value: 'new-save' },
  ], f.own.revision)
  release()
  await assert.rejects(rollback, { code: 'MIGRATION_CONFLICT' })
  assert.equal(f.own.value.baseURL, 'https://new.invalid/v1')
  assert.equal(f.own.value.operationId, 'new-save')
  assert.equal(f.legacy.user.providers.CLIProxyAPI, undefined)
})

test('legacy credential headers are rejected before intent or backup', async () => {
  for (const name of ['X-Api-Key', 'x-api-key', 'CF-AIG-Authorization', 'Proxy-Authorization', 'Cookie']) {
    const f = fixture()
    f.legacy.user.providers.CLIProxyAPI.headers = { [name]: 'sensitive-value' }
    const info = legacyView(f.settings)
    assert.equal(info.available, false)
    await assert.rejects(prepareLegacy(f.settings, { expectedRevision: 0, expectedLegacyRevision: 0, fingerprint: '', operationId: 'blocked' }))
    assert.equal(f.own.revision, 0)
    assert.equal(f.own.value.migration, undefined)
  }
})

test('migration combines model entries and explicit overrides', async () => {
  const f = fixture()
  const profile = f.legacy.user.providers.CLIProxyAPI
  profile.models = [{ id: 'old', contextWindow: 6000, input: ['image'], reasoningEfforts: { low: 'low' }, compat: { supportsTemperature: false } }]
  profile.modelOverrides = { old: { contextWindow: 7000 } }
  const info = legacyView(f.settings)
  await prepareLegacy(f.settings, { expectedRevision: 0, expectedLegacyRevision: 0, fingerprint: info.fingerprint, operationId: 'models' })
  assert.deepEqual(f.own.value.overrides.old, { contextWindow: 7000, inputModalities: ['image'], reasoningEfforts: { low: 'low' }, compat: { supportsTemperature: false } })
})

test('rollback preserves both states when a new save wins during legacy restore', async () => {
  const f = fixture()
  const info = legacyView(f.settings)
  await prepareLegacy(f.settings, { expectedRevision: 0, expectedLegacyRevision: 0, fingerprint: info.fingerprint, operationId: 'restore-race' })
  await cutoverLegacy(f.settings)
  const mutate = f.settings.mutate.bind(f.settings)
  let resume, restored
  const gate = new Promise((resolve) => { resume = resolve })
  const reached = new Promise((resolve) => { restored = resolve })
  f.settings.mutate = async (ns, ops, revision) => {
    await mutate(ns, ops, revision)
    if (ns === 'llm-pi-ai' && ops[0].op === 'set') { restored(); await gate }
  }
  const rollback = rollbackLegacy(f.settings, async () => { })
  await reached
  await mutate('llm-cliproxyapi', [{ op: 'set', path: ['baseURL'], value: 'https://new.invalid/v1' }, { op: 'set', path: ['generation'], value: 'new-generation' }], f.own.revision)
  resume()
  await assert.rejects(rollback, { code: 'MIGRATION_CONFLICT' })
  assert.equal(f.own.value.baseURL, 'https://new.invalid/v1')
  assert.equal(f.legacy.user.providers.CLIProxyAPI.baseURL, 'https://legacy.invalid/v1')
})
