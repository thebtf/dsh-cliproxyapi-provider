import test from 'node:test'
import assert from 'node:assert/strict'
import { AsyncLocalStorage } from 'node:async_hooks'
import { Context, Service } from '@deepseek-ai/cordis'
import { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { createUserMessage, LlmRuntime } from '@deepseek-ai/dsh-llm'
import {
  Config as PiAiConfig,
  apply as applyPiAi,
  inject as piAiInject,
  name as piAiName,
} from '@deepseek-ai/dsh-llm-pi-ai'
import {
  Config,
  CATALOG_PATH,
  PLACEHOLDER_AUTHORIZATION,
  PROFILE_SYNC_HEADER,
  apply,
} from '../src/index.js'

async function resolvedConfig(overrides = {}) {
  const result = await Config['~standard'].validate(overrides)
  assert.equal(result.issues, undefined)
  return result.value
}

function managedProfile(overrides = {}) {
  return {
    displayName: 'CLIProxyAPI',
    api: 'openai-responses',
    baseURL: 'http://127.0.0.1:8317/v1',
    models: [{ id: 'old', name: 'old', contextWindow: 1000, maxTokens: 100, input: ['text'] }],
    defaultContextWindow: 262144,
    defaultMaxTokens: 32768,
    defaultInput: ['text'],
    headers: {},
    ...overrides,
  }
}

function createContext(initialSection, initialCredential) {
  let section = initialSection
  let revision = 0
  let selection = {}
  let credential = initialCredential
  const discoveries = new Map()
  const listeners = new Map()
  const routes = new Map()
  const mutations = []
  const warnings = []
  const effects = []
  const timeouts = []

  const ctx = {
    connection: {
      fetch: {
        register(route) {
          routes.set(route.path, route)
          return () => routes.delete(route.path)
        },
      },
    },
    llm: {
      registerModelDiscovery(ns, handler) {
        discoveries.set(String(ns), handler)
        return () => discoveries.delete(String(ns))
      },
      registerConfigurableProviders() {
        throw new Error('the plugin must not own the configurable-provider directory')
      },
    },
    settings: {
      describe() {
        return [{ ns: 'llm-pi-ai', value: section, revision }, { ns: 'llm-cliproxyapi', value: { modelSelection: selection }, revision: 0 }]
      },
      async mutate(_ns, ops, expectedRevision) {
        if (expectedRevision !== undefined && expectedRevision !== revision) {
          const error = new Error('Settings revision conflict')
          error.code = 'SETTINGS_CONFLICT'
          throw error
        }
        mutations.push(ops)
        const providers = { ...(section.providers || {}) }
        for (const op of ops) {
          assert.equal(op.path[0], 'providers')
          if (op.op === 'set') providers[op.path[1]] = op.value
          else delete providers[op.path[1]]
        }
        section = { ...section, providers }
        revision += 1
      },
    },
    credentials: {
      async resolve() {
        return credential === undefined ? undefined : { value: credential }
      },
    },
    on(event, listener) {
      const rows = listeners.get(event) || []
      rows.push(listener)
      listeners.set(event, rows)
      return () => listeners.set(event, rows.filter((row) => row !== listener))
    },
    effect(factory) {
      const cleanup = factory()
      const dispose = () => cleanup?.()
      effects.push(dispose)
      return dispose
    },
    inject(_services, callback) {
      return callback(ctx)
    },
    timeout(callback, delay) {
      const row = { callback, delay, cancelled: false }
      timeouts.push(row)
      return () => { row.cancelled = true }
    },
    logger: {
      warn(message) {
        warnings.push(String(message))
      },
    },
  }

  return {
    ctx,
    discoveries,
    routes,
    mutations,
    warnings,
    timeouts,
    get section() { return section },
    setSection(value) { section = value; revision += 1 },
    setSelection(value) { selection = value },
    setCredential(value) { credential = value },
    emit(event, ...args) {
      for (const listener of listeners.get(event) || []) listener(...args)
    },
    dispose() {
      for (const effect of effects.reverse()) effect()
    },
  }
}

async function waitFor(predicate, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('timed out waiting for condition')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

test('registers rich discovery without competing for the provider directory', async () => {
  const harness = createContext({ providers: {} })
  apply(harness.ctx, await resolvedConfig())
  assert.deepEqual([...harness.discoveries.keys()], ['llm-cliproxyapi'])
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(harness.mutations.length, 0)
  harness.dispose()
})

test('initial discovery requests the fixed rich catalog and returns full capabilities', async () => {
  const previousFetch = globalThis.fetch
  let requestURL
  globalThis.fetch = async (url) => {
    requestURL = String(url)
    return new Response(JSON.stringify({
      models: [{
        slug: 'gpt-5.6-sol',
        display_name: 'GPT 5.6 Sol',
        max_context_window: 372000,
        input_modalities: ['text', 'image'],
        supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }],
      }]
    }), { status: 200 })
  }
  try {
    const harness = createContext({ providers: {} })
    apply(harness.ctx, await resolvedConfig())
    const models = await harness.discoveries.get('llm-cliproxyapi')({
      provider: 'CLIProxyAPI',
      baseURL: 'http://127.0.0.1:8317/v1',
      apiKey: 'secret-key',
    }, new AbortController().signal)
    assert.equal(
      requestURL,
      'http://127.0.0.1:8317/v1/models?client_version=dsh-cliproxyapi-provider',
    )
    assert.deepEqual(models[0], {
      id: 'gpt-5.6-sol',
      name: 'GPT 5.6 Sol',
      contextWindow: 372000,
      maxTokens: 32768,
      input: ['text', 'image'],
      inputModalities: ['text', 'image'],
      reasoningEfforts: { low: 'low', high: 'high' },
      catalogMetadata: {
        slug: 'gpt-5.6-sol', display_name: 'GPT 5.6 Sol', max_context_window: 372000,
        input_modalities: ['text', 'image'],
        supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }],
      },
      catalogSources: { contextWindow: 'cpa', maxTokens: 'default', inputModalities: 'cpa', reasoningEfforts: 'cpa' },
    })
    harness.dispose()
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('full catalog route preserves reasoning and unknown metadata through an authenticated Connection route', async () => {
  const previousFetch = globalThis.fetch
  const entry = {
    slug: 'rich-route', max_context_window: 200000, max_output_tokens: 32000,
    supported_reasoning_levels: [{ effort: 'low', description: 'Fast' }, { effort: 'high', description: 'Thorough' }],
    default_reasoning_level: 'high', custom: { formats: ['text', 'json'] },
  }
  globalThis.fetch = async () => Response.json({ models: [entry] })
  const harness = createContext({ providers: {} })
  try {
    apply(harness.ctx, await resolvedConfig())
    const route = harness.routes.get(CATALOG_PATH)
    assert.deepEqual(route.methods, ['POST'])
    assert.equal(route.requestBody, 'buffered')
    const response = await route.fetch(new Request('http://host' + CATALOG_PATH, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseURL: 'http://127.0.0.1:8317/v1' }),
    }))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const body = await response.json()
    assert.equal(body.ok, true)
    assert.deepEqual(body.value[0].catalogMetadata, entry)
    assert.deepEqual(body.value[0].reasoningEfforts, { low: 'low', high: 'high' })
    assert.deepEqual(body.value[0].catalogSources, { contextWindow: 'cpa', maxTokens: 'cpa', inputModalities: 'default', reasoningEfforts: 'cpa' })
    assert.equal(harness.mutations.length, 0)
  } finally {
    harness.dispose()
    globalThis.fetch = previousFetch
  }
})

test('full catalog route refuses malformed, oversized and unexpected fields without upstream requests', async () => {
  const previousFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls += 1; throw new Error('must not fetch') }
  const harness = createContext({ providers: {} })
  try {
    apply(harness.ctx, await resolvedConfig())
    const route = harness.routes.get(CATALOG_PATH)
    for (const [body, type, status] of [
      ['{}', 'text/plain', 415], ['{', 'application/json', 400],
      [JSON.stringify({ baseURL: 'http://host/v1', extra: true }), 'application/json', 400],
      [JSON.stringify({ baseURL: 'http://host/v1', apiKey: 123 }), 'application/json', 400],
      [JSON.stringify({ baseURL: 'http://host/v1', apiKey: 'x'.repeat(17000) }), 'application/json', 400],
    ]) {
      const response = await route.fetch(new Request('http://host' + CATALOG_PATH, { method: 'POST', headers: { 'content-type': type }, body }))
      assert.equal(response.status, status)
      assert.equal((await response.json()).ok, false)
    }
    assert.equal(calls, 0)
  } finally {
    harness.dispose()
    globalThis.fetch = previousFetch
  }
})
test('catalog RPC and POST bind saved keys to their endpoint without fallback', async () => {
  const previousFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (_url, init) => { calls.push(new Headers(init.headers).get('authorization')); return Response.json({ models: [{ slug: 'model' }] }) }
  const harness = createContext({ providers: {} }, 'legacy-secret')
  const describe = harness.ctx.settings.describe
  harness.ctx.settings.describe = () => describe().map((entry) => entry.ns === 'llm-cliproxyapi'
    ? { ...entry, revision: 0, value: { baseURL: 'https://saved.invalid/v1', authIdentity: { type: 'reference', ref: 'CPA_TEST_KEY' } } } : entry)
  harness.ctx.credentials.resolve = async (ref) => ({ value: String(ref).includes('CPA_TEST_KEY') ? 'saved-secret' : 'legacy-secret' })
  try {
    apply(harness.ctx, await resolvedConfig())
    const rpc = harness.discoveries.get('llm-cliproxyapi')
    const post = async (body) => harness.routes.get(CATALOG_PATH).fetch(new Request('http://host' + CATALOG_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
    await rpc({ baseURL: 'https://new.invalid/v1' })
    assert.equal((await post({ baseURL: 'https://new.invalid/v1' })).status, 200)
    await rpc({ baseURL: 'https://saved.invalid/v1' })
    assert.equal((await post({ baseURL: 'https://saved.invalid/v1' })).status, 200)
    await rpc({ baseURL: 'https://new.invalid/v1', apiKey: 'explicit-key' })
    assert.equal((await post({ baseURL: 'https://new.invalid/v1', allowEndpointReuse: true })).status, 200)
    assert.deepEqual(calls, [null, null, 'Bearer saved-secret', 'Bearer saved-secret', 'Bearer explicit-key', 'Bearer saved-secret'])
    const command = harness.routes.get('/api/cliproxyapi/command')
    for (const body of [
      { type: 'preview-models', baseURL: 'https://new.invalid/v1', extra: true },
      { type: 'preview-models', baseURL: 'https://new.invalid/v1', apiKey: 7 },
      { type: 'save-connection', expectedRevision: 0, operationId: 'bad', baseURL: 'https://new.invalid/v1', authEdit: { type: 'none', extra: true } },
    ]) {
      const response = await command.fetch(new Request('http://host/api/cliproxyapi/command', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
      assert.equal(response.status, 400)
    }
    assert.equal(calls.length, 6)
  } finally { harness.dispose(); globalThis.fetch = previousFetch }
})
test('legacy discovery reuses its key only at its known endpoint', async () => {
  const previousFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (_url, init) => { calls.push(new Headers(init.headers).get('authorization')); return Response.json({ models: [{ slug: 'model' }] }) }
  const harness = createContext({ providers: {} }, 'legacy-secret')
  try {
    apply(harness.ctx, await resolvedConfig())
    await new Promise((resolve) => setTimeout(resolve, 0))
    harness.setSection({ providers: { CLIProxyAPI: managedProfile() } })
    const rpc = harness.discoveries.get('llm-cliproxyapi')
    await rpc({ baseURL: 'http://127.0.0.1:8317/v1' })
    await rpc({ baseURL: 'https://new.invalid/v1' })
    const response = await harness.routes.get(CATALOG_PATH).fetch(new Request('http://host' + CATALOG_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ baseURL: 'http://127.0.0.1:8317/v1' }) }))
    assert.equal(response.status, 200)
    assert.deepEqual(calls, ['Bearer legacy-secret', null, 'Bearer legacy-secret'])
  } finally { harness.dispose(); globalThis.fetch = previousFetch }
})



test('settings changes synchronize outside the originating transaction', async () => {
  const transaction = new AsyncLocalStorage()
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ models: [{ slug: 'model' }] }), { status: 200 })
  const harness = createContext({ providers: {} })
  const mutate = harness.ctx.settings.mutate
  harness.ctx.settings.mutate = async (...args) => {
    if (transaction.getStore()) throw new Error('HMR transactions cannot be nested')
    return mutate(...args)
  }
  try {
    apply(harness.ctx, await resolvedConfig())
    await new Promise((resolve) => setTimeout(resolve, 0))
    harness.setSection({ providers: { CLIProxyAPI: managedProfile() } })
    transaction.run(true, () => harness.emit('settings/document-updated', 'llm-pi-ai'))
    await waitFor(() => harness.mutations.length === 1)
  } finally {
    harness.dispose()
    globalThis.fetch = previousFetch
  }
})

test('a new bootstrap token triggers synchronization for an unchanged profile', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ models: [{ slug: 'model' }] }), { status: 200 })
  const harness = createContext({ providers: { CLIProxyAPI: managedProfile() } })
  try {
    apply(harness.ctx, await resolvedConfig())
    await waitFor(() => harness.mutations.length === 1)
    const profile = harness.section.providers.CLIProxyAPI
    harness.setSection({ providers: { CLIProxyAPI: { ...profile, headers: { ...profile.headers, [PROFILE_SYNC_HEADER]: 'rich:again' } } } })
    harness.emit('settings/document-updated', 'llm-pi-ai')
    await waitFor(() => harness.mutations.length === 2)
    assert.equal(harness.section.providers.CLIProxyAPI.headers[PROFILE_SYNC_HEADER], undefined)
  } finally {
    harness.dispose()
    globalThis.fetch = previousFetch
  }
})

test('first profile synchronization restores capabilities stripped by the browser RPC', async () => {
  const previousFetch = globalThis.fetch
  let fetches = 0
  globalThis.fetch = async () => {
    fetches += 1
    return new Response(JSON.stringify({
      models: [
        {
          slug: 'gpt-5.6-sol',
          display_name: 'GPT 5.6 Sol',
          max_context_window: 372000,
          input_modalities: ['text', 'image'],
          supported_reasoning_levels: [
            { effort: 'low' }, { effort: 'medium' }, { effort: 'high' },
            { effort: 'xhigh' }, { effort: 'max' },
          ],
        },
        {
          slug: 'gpt-5.6-spark',
          display_name: 'GPT 5.6 Spark',
          input_modalities: ['text'],
        },
      ]
    }), { status: 200 })
  }
  try {
    const harness = createContext({ providers: {} })
    apply(harness.ctx, await resolvedConfig())
    await new Promise((resolve) => setTimeout(resolve, 0))
    const discovered = await harness.discoveries.get('llm-cliproxyapi')({
      provider: 'CLIProxyAPI',
      baseURL: 'http://127.0.0.1:8317/v1',
    }, new AbortController().signal)
    const bootstrapModels = discovered.map(({ id, name, contextWindow, maxTokens, inputModalities }) => ({
      id, name, contextWindow, maxTokens,
      ...(inputModalities ? { input: [...inputModalities] } : {}),
    }))
    harness.setSection({
      providers: {
        CLIProxyAPI: managedProfile({
          models: bootstrapModels,
          headers: {
            [PROFILE_SYNC_HEADER]: 'rich:test',
            authorization: PLACEHOLDER_AUTHORIZATION,
          },
        }),
      }
    })
    harness.emit('settings/document-updated', 'llm-pi-ai', harness.section, undefined, 'update')

    await waitFor(() => harness.mutations.length === 1)
    const profile = harness.mutations[0][0].value
    assert.equal(fetches, 1)
    assert.equal(profile.headers[PROFILE_SYNC_HEADER], undefined)
    assert.deepEqual(profile.models[0], {
      id: 'gpt-5.6-sol',
      name: 'GPT 5.6 Sol',
      contextWindow: 372000,
      maxTokens: 32768,
      input: ['text', 'image'],
      reasoningEfforts: {
        low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max',
      },
      compat: { chatTemplateKwargs: {}, chatTemplateArgs: {} },
    })
    assert.deepEqual(profile.models[1].input, ['text'])
    assert.equal(profile.compat.supportsStrictMode, true)
    await waitFor(() => harness.timeouts.some((row) => row.delay === 300000))
    const periodic = harness.timeouts.find((row) => row.delay === 300000)
    periodic.callback()
    await waitFor(() => fetches === 2)
    await waitFor(() => harness.timeouts.filter((row) => row.delay === 300000).length === 2)
    harness.dispose()
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('credential refresh cannot finalize a pending bootstrap profile early', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    models: [{
      slug: 'vision-model',
      input_modalities: ['text', 'image'],
      supported_reasoning_levels: [{ effort: 'high' }],
    }]
  }), { status: 200 })
  try {
    const harness = createContext({ providers: {} })
    apply(harness.ctx, await resolvedConfig())
    await new Promise((resolve) => setTimeout(resolve, 0))
    harness.setSection({
      providers: {
        CLIProxyAPI: managedProfile({
          models: [{
            id: 'vision-model', name: 'Vision Model', contextWindow: 262144, maxTokens: 32768,
            input: ['text', 'image'], reasoningEfforts: { high: 'high' },
          }],
          headers: {
            [PROFILE_SYNC_HEADER]: 'rich:test',
            authorization: PLACEHOLDER_AUTHORIZATION,
          },
        }),
      }
    })
    harness.setCredential('secret-key')
    harness.emit('credentials/reference-updated', 'DSH_CLIPROXY_API_KEY')

    await waitFor(() => harness.mutations.length === 1)
    await new Promise((resolve) => setTimeout(resolve, 25))
    const profile = harness.mutations[0][0].value
    assert.equal(harness.mutations.length, 1)
    assert.equal(profile.headers[PROFILE_SYNC_HEADER], undefined)
    assert.equal(profile.apiKeyEnv, 'DSH_CLIPROXY_API_KEY')
    assert.deepEqual(profile.models[0].input, ['text', 'image'])
    assert.deepEqual(profile.models[0].reasoningEfforts, { high: 'high' })
    harness.dispose()
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('keyless profiles omit apiKeyEnv and receive a non-sensitive placeholder header', async () => {
  const previousFetch = globalThis.fetch
  let fetches = 0
  globalThis.fetch = async () => {
    fetches += 1
    return new Response(JSON.stringify({ models: [{ slug: 'model-a' }] }), { status: 200 })
  }
  try {
    const harness = createContext({
      providers: {
        CLIProxyAPI: managedProfile(),
      }
    })
    apply(harness.ctx, await resolvedConfig())
    await waitFor(() => harness.mutations.length === 1)
    const profile = harness.mutations[0][0].value
    assert.equal(profile.apiKeyEnv, undefined)
    assert.equal(profile.headers.authorization, PLACEHOLDER_AUTHORIZATION)
    assert.equal(profile.models[0].id, 'model-a')
    harness.emit('settings/document-updated', 'llm-pi-ai', harness.section, undefined, 'update')
    await new Promise((resolve) => setTimeout(resolve, 25))
    assert.equal(harness.mutations.length, 1)
    assert.equal(fetches, 1)
    harness.dispose()
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('refreshIntervalMs zero disables healthy periodic refreshes', async () => {
  const previousFetch = globalThis.fetch
  let fetches = 0
  globalThis.fetch = async () => {
    fetches += 1
    return new Response(JSON.stringify({ models: [{ slug: 'model-a' }] }), { status: 200 })
  }
  try {
    const harness = createContext({
      providers: {
        CLIProxyAPI: managedProfile(),
      }
    })
    apply(harness.ctx, await resolvedConfig({ refreshIntervalMs: 0 }))
    await waitFor(() => fetches === 1)
    await new Promise((resolve) => setTimeout(resolve, 25))
    assert.equal(harness.timeouts.length, 0)
    harness.dispose()
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('credential removal regenerates the profile in keyless mode', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ models: [{ slug: 'model-a' }] }), { status: 200 })
  try {
    const harness = createContext({
      providers: {
        CLIProxyAPI: managedProfile({
          apiKeyEnv: 'DSH_CLIPROXY_API_KEY',
          headers: {
            authorization: PLACEHOLDER_AUTHORIZATION,
          },
        }),
      }
    }, 'secret-key')
    apply(harness.ctx, await resolvedConfig())
    await waitFor(() => harness.mutations.length === 1)
    assert.equal(harness.mutations[0][0].value.apiKeyEnv, 'DSH_CLIPROXY_API_KEY')
    assert.equal(harness.mutations[0][0].value.headers.authorization, undefined)

    harness.mutations.length = 0
    harness.setCredential(undefined)
    harness.emit('credentials/reference-updated', 'DSH_CLIPROXY_API_KEY')
    await waitFor(() => harness.mutations.length === 1)
    const profile = harness.mutations[0][0].value
    assert.equal(profile.apiKeyEnv, undefined)
    assert.equal(profile.headers.authorization, PLACEHOLDER_AUTHORIZATION)
    harness.dispose()
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('a conflicting profile write is retried from the latest revision without losing concurrent edits', async () => {
  const previousFetch = globalThis.fetch
  let fetches = 0
  globalThis.fetch = async () => {
    fetches += 1
    return new Response(JSON.stringify({ models: [{ slug: 'model-a' }] }), { status: 200 })
  }
  const harness = createContext({ providers: { CLIProxyAPI: managedProfile() } })
  const mutate = harness.ctx.settings.mutate
  const revisions = []
  harness.ctx.settings.mutate = async (ns, ops, expectedRevision) => {
    revisions.push(expectedRevision)
    if (revisions.length === 1) {
      harness.setSection({
        providers: {
          CLIProxyAPI: managedProfile({
            headers: { 'X-Concurrent': 'preserved' }, defaultContextWindow: 9000,
          })
        }
      })
    }
    return mutate(ns, ops, expectedRevision)
  }
  try {
    apply(harness.ctx, await resolvedConfig({ retryInitialMs: 20, retryMaxMs: 20 }))
    await waitFor(() => harness.timeouts.some((row) => row.delay === 20))
    assert.equal(harness.mutations.length, 0)
    assert.equal(harness.section.providers.CLIProxyAPI.headers['X-Concurrent'], 'preserved')
    harness.timeouts.find((row) => row.delay === 20).callback()
    await waitFor(() => harness.mutations.length === 1)
    assert.deepEqual(revisions, [0, 1])
    const profile = harness.section.providers.CLIProxyAPI
    assert.equal(profile.headers['X-Concurrent'], 'preserved')
    assert.equal(profile.defaultContextWindow, 9000)
    assert.deepEqual(profile.models.map((model) => model.id), ['model-a'])
    harness.emit('settings/document-updated', 'llm-pi-ai')
    await new Promise((resolve) => setTimeout(resolve, 25))
    assert.equal(fetches, 2)
  } finally {
    harness.dispose()
    globalThis.fetch = previousFetch
  }
})

test('a newer settings change aborts stale discovery and only installs the latest profile', async () => {
  const previousFetch = globalThis.fetch
  let markFirstStarted
  const firstStarted = new Promise((resolve) => { markFirstStarted = resolve })
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('8317')) {
      markFirstStarted()
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
      })
    }
    return new Response(JSON.stringify({ models: [{ slug: 'model-b' }] }), { status: 200 })
  }
  try {
    const harness = createContext({
      providers: {
        CLIProxyAPI: managedProfile(),
      }
    })
    apply(harness.ctx, await resolvedConfig())
    await firstStarted
    harness.setSection({
      providers: {
        CLIProxyAPI: managedProfile({ baseURL: 'http://127.0.0.1:9417/v1' }),
      }
    })
    harness.emit('settings/document-updated', 'llm-pi-ai', harness.section, undefined, 'update')
    await waitFor(() => harness.mutations.length === 1)
    const profile = harness.mutations[0][0].value
    assert.equal(profile.baseURL, 'http://127.0.0.1:9417/v1')
    assert.deepEqual(profile.models.map((model) => model.id), ['model-b'])
    harness.dispose()
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('catalog requests honor timeout and failed refreshes use exponential backoff', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (_url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
  })
  try {
    const harness = createContext({
      providers: {
        CLIProxyAPI: managedProfile(),
      }
    })
    apply(harness.ctx, await resolvedConfig({ fetchTimeoutMs: 10, retryInitialMs: 20, retryMaxMs: 80 }))
    await waitFor(() => harness.timeouts.length === 1)
    assert.equal(harness.timeouts[0].delay, 20)
    assert.match(harness.warnings[0], /timed out after 10 ms/)

    harness.timeouts[0].callback()
    await waitFor(() => harness.timeouts.length === 2)
    assert.equal(harness.timeouts[1].delay, 40)
    harness.dispose()
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('real Cordis composition leaves llm-pi-ai as the sole directory owner', async () => {
  const previousFetch = globalThis.fetch
  let inferenceAuthorization
  let inferencePayload
  let catalogFetches = 0
  const document = {
    'llm-pi-ai': {
      providers: {},
    },
  }

  class MemorySettings extends Service {
    constructor(ctx) { super(ctx, 'settings') }
    configure() { return () => { } }
    describe() { return [{ ns: 'llm-pi-ai', value: structuredClone(document['llm-pi-ai']), revision: this.revision ?? 0 }] }
    async mutate(ns, ops, expectedRevision) {
      if (expectedRevision !== undefined) assert.equal(expectedRevision, this.revision ?? 0)
      assert.equal(ns, 'llm-pi-ai')
      for (const op of ops) {
        assert.equal(op.op, 'set')
        assert.deepEqual(op.path, ['providers', 'CLIProxyAPI'])
        document[ns].providers.CLIProxyAPI = structuredClone(op.value)
      }
      this.revision = (this.revision ?? 0) + 1
      this.ctx.emit('settings/document-updated', ns, 1)
    }
  }

  class MemoryCredentials extends CredentialProvider {
    async resolve() { return undefined }
    async describe() { return { configured: false, writable: true } }
    async set() { }
    async unset() { }
  }

  class TimerService extends Service {
    constructor(ctx) {
      super(ctx, 'timer')
      ctx.mixin('timer', ['timeout'])
    }
    timeout(callback, delay) {
      return this.ctx.effect(() => {
        const timer = setTimeout(callback, delay)
        return () => clearTimeout(timer)
      })
    }
  }

  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    if (method === 'GET' && url.includes('/models?')) {
      catalogFetches += 1
      return new Response(JSON.stringify({
        models: [
          { slug: 'plain', supported_reasoning_levels: [{ effort: 'none' }] },
          { slug: 'think', input_modalities: ['text', 'image'], supported_reasoning_levels: [{ effort: 'none' }, { effort: 'high' }] },
        ]
      }), { status: 200 })
    }
    const headers = new Headers(input instanceof Request ? input.headers : undefined)
    for (const [key, value] of new Headers(init?.headers)) headers.set(key, value)
    inferenceAuthorization = headers.get('authorization')
    inferencePayload = input instanceof Request ? await input.clone().json() : JSON.parse(init.body)
    return new Response(JSON.stringify({ error: { message: 'intentional test response' } }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    })
  }

  const ctx = new Context()
  const fibers = []
  try {
    fibers.push(ctx.plugin(LlmRuntime))
    fibers.push(ctx.plugin(MemorySettings))
    fibers.push(ctx.plugin(MemoryCredentials))
    fibers.push(ctx.plugin(TimerService))
    await Promise.all(fibers.map((fiber) => fiber.await()))

    const piFiber = ctx.plugin({
      name: piAiName,
      inject: piAiInject,
      Config: PiAiConfig,
      apply: applyPiAi,
    }, { providers: {} })
    const cpaFiber = ctx.plugin({ name: 'llm-cliproxyapi', inject: ['settings', 'credentials', 'llm', 'timer'], Config, apply }, {
      retryInitialMs: 10,
      retryMaxMs: 20,
    })
    fibers.push(piFiber, cpaFiber)
    await Promise.all([piFiber.await(), cpaFiber.await()])

    const discovered = await ctx.llm.discoverModels('llm-cliproxyapi', {
      provider: 'CLIProxyAPI',
      baseURL: 'http://127.0.0.1:8317/v1',
      signal: new AbortController().signal,
    })
    assert.equal(discovered[0].input, undefined)
    assert.deepEqual(discovered[1].inputModalities, ['text', 'image'])
    assert.equal(discovered[1].reasoningEfforts, undefined)
    await ctx.settings.mutate('llm-pi-ai', [{
      op: 'set',
      path: ['providers', 'CLIProxyAPI'],
      value: managedProfile({
        models: discovered,
        modelOverrides: { think: { name: 'Unsupported override' } },
        headers: {
          [PROFILE_SYNC_HEADER]: 'rich:integration-test',
          authorization: PLACEHOLDER_AUTHORIZATION,
        },
      }),
    }])

    await waitFor(() => ctx.settings.describe()[0].value?.providers?.CLIProxyAPI?.models?.[0]?.id === 'plain')
    await waitFor(() => ctx.settings.describe()[0].value.providers.CLIProxyAPI.headers[PROFILE_SYNC_HEADER] === undefined)
    assert.equal(catalogFetches, 1)
    piFiber.update({ providers: ctx.settings.describe()[0].value.providers })
    await piFiber.await()
    const directories = ctx.llm.listConfigurableProviders().filter((entry) => entry.provider === 'CLIProxyAPI')
    assert.equal(directories.length, 1)
    assert.equal(directories[0].settingsNs, 'llm-pi-ai')
    assert.equal(ctx.llm.listProviders().some((provider) => provider.id === 'CLIProxyAPI'), true)
    const models = ctx.settings.describe()[0].value.providers.CLIProxyAPI.models
    assert.deepEqual(ctx.settings.describe()[0].value.providers.CLIProxyAPI.modelOverrides ?? {}, {})
    assert.equal(models[0].reasoningEfforts, undefined)
    assert.deepEqual(models[1].reasoningEfforts, { off: 'none', high: 'high' })
    assert.deepEqual(models[1].input, ['text', 'image'])
    assert.deepEqual((await ctx.llm.resolveModelInfo('CLIProxyAPI', 'think')).inputModalities, ['text', 'image'])

    const toolParameters = { type: 'object', properties: { path: { type: 'string' }, mode: { type: 'string' } }, required: ['path'], additionalProperties: false }
    const chunks = []
    for await (const chunk of ctx.llm.stream({
      provider: 'CLIProxyAPI',
      model: 'plain',
      tools: [{ name: 'optional_parameter_probe', description: 'A tool with an optional parameter', parameters: toolParameters }],
      messages: [createUserMessage({
        content: [{ type: 'text', text: 'probe' }],
        source: { kind: 'user' },
      })],
    })) chunks.push(chunk)
    assert.equal(inferenceAuthorization, PLACEHOLDER_AUTHORIZATION)
    assert.equal(inferencePayload.tools[0].strict, false)
    assert.deepEqual(inferencePayload.tools[0].parameters, toolParameters)
    assert.equal(chunks.at(-1)?.type, 'finish')
    assert.notEqual(chunks.at(-1)?.reason?.failure?.code, 'MISSING_CREDENTIAL')
  } finally {
    globalThis.fetch = previousFetch
    for (const fiber of fibers.reverse()) await fiber.dispose().catch(() => { })
  }
})

test('model selection survives catalog changes and settings updates without nested HMR writes', async () => {
  const previousFetch = globalThis.fetch
  const transaction = new AsyncLocalStorage()
  let catalog = [{ slug: 'enabled' }, { slug: 'disabled' }]
  globalThis.fetch = async () => new Response(JSON.stringify({ models: catalog }), { status: 200 })
  const harness = createContext({
    providers: {
      CLIProxyAPI: managedProfile({
        headers: { 'X-Custom': 'kept' }, compat: { supportsStore: false }, retryPolicy: { mode: 'always' },
        modelOverrides: { enabled: { name: 'Custom' } }, defaultContextWindow: 9000,
      })
    }
  })
  let describes = 0
  const describe = harness.ctx.settings.describe
  harness.ctx.settings.describe = () => { describes++; return describe() }
  harness.setSelection({ disabled: false, absent: false })
  const mutate = harness.ctx.settings.mutate
  harness.ctx.settings.mutate = async (...args) => {
    if (transaction.getStore()) throw new Error('HMR transactions cannot be nested')
    return mutate(...args)
  }
  try {
    apply(harness.ctx, await resolvedConfig())
    await waitFor(() => harness.mutations.length === 1)
    assert.deepEqual(harness.section.providers.CLIProxyAPI.models.map((model) => model.id), ['enabled'])
    assert.equal(harness.section.providers.CLIProxyAPI.headers['X-Custom'], 'kept')
    assert.deepEqual(harness.section.providers.CLIProxyAPI.compat, { supportsStore: false, supportsStrictMode: true, chatTemplateArgs: {}, chatTemplateKwargs: {} })
    assert.deepEqual(harness.section.providers.CLIProxyAPI.retryPolicy, {
      mode: 'always', backoff: { initialDelayMs: 500, maxDelayMs: 10000, jitterRatio: 0.1 },
    })
    assert.deepEqual(harness.section.providers.CLIProxyAPI.modelOverrides ?? {}, {})
    assert.equal(harness.section.providers.CLIProxyAPI.defaultContextWindow, 9000)

    catalog = [{ slug: 'disabled' }, { slug: 'absent' }, { slug: 'new' }]
    const previousDescribes = describes
    transaction.run(true, () => harness.emit('settings/document-updated', 'llm-cliproxyapi'))
    await waitFor(() => harness.mutations.length === 2)
    assert.deepEqual(harness.section.providers.CLIProxyAPI.models.map((model) => model.id), ['new'])
    // The gateway also reads settings on updates; the selection behavior above is the contract.
    assert.ok(describes > previousDescribes)

    harness.setSelection({ disabled: true, absent: false })
    harness.emit('settings/document-updated', 'llm-cliproxyapi')
    await waitFor(() => harness.mutations.length === 3)
    assert.deepEqual(harness.section.providers.CLIProxyAPI.models.map((model) => model.id), ['disabled', 'new'])
  } finally {
    harness.dispose()
    globalThis.fetch = previousFetch
  }
})

test('an empty enabled catalog leaves the existing provider intact and reports the failure', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ models: [{ slug: 'disabled' }] }), { status: 200 })
  const harness = createContext({ providers: { CLIProxyAPI: managedProfile() } })
  harness.setSelection({ disabled: false })
  try {
    apply(harness.ctx, await resolvedConfig())
    await waitFor(() => harness.warnings.length > 0)
    assert.match(harness.warnings[0], /no enabled models/)
    assert.equal(harness.mutations.length, 0)
    assert.equal(harness.section.providers.CLIProxyAPI.models[0].id, 'old')
  } finally {
    harness.dispose()
    globalThis.fetch = previousFetch
  }
})

test('catalog boundary classifies upstream failures without exposing bodies', async () => {
  const h = createContext({ providers: {} })
  const oldFetch = globalThis.fetch
  try {
    apply(h.ctx, await resolvedConfig({ refreshIntervalMs: 0 }))
    const route = h.routes.get(CATALOG_PATH)
    for (const [response, expected] of [
      [new Response('private-auth-body', { status: 401 }), 'CATALOG_AUTH'],
      [new Response('private-error-body', { status: 503 }), 'CATALOG_TRANSPORT'],
      [new Response('not-json-private'), 'CATALOG_INVALID_RESPONSE'],
      [new Response('', { headers: { 'content-length': '5000000' } }), 'CATALOG_TOO_LARGE'],
    ]) {
      globalThis.fetch = async () => response
      const result = await route.fetch(new Request('http://host/api/cliproxyapi/catalog', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ baseURL: 'https://fixture.invalid/v1', apiKey: '' }) }))
      const body = await result.json()
      assert.equal(body.error.code, expected)
      assert.equal(JSON.stringify(body).includes('private'), false)
    }
  } finally { globalThis.fetch = oldFetch; h.dispose() }
})
