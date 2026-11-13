import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { LlmRuntime, createUserMessage } from '@deepseek-ai/dsh-llm'
import { Config, apply, inject, name } from '../src/index.js'

test('own CPA connection can publish a native route without a generic provider profile', async () => {
  const routes = new Map()
  const home = await mkdtemp(join(tmpdir(), 'dsh-cpa-test-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const sections = new Map([
    ['llm-pi-ai', { value: { providers: {} }, revision: 0 }],
    ['llm-cliproxyapi', { value: {}, revision: 0 }],
  ])

  class MemorySettings extends Service {
    constructor(ctx) { super(ctx, 'settings'); this.documentPath = join(home, 'profile.yml') }
    configure() { return () => { } }
    describe() {
      return [...sections].map(([ns, section]) => ({ ns, ...structuredClone(section) }))
    }
    async mutate(ns, ops, expectedRevision) {
      const section = sections.get(ns) ?? { value: {}, revision: 0 }
      if (expectedRevision !== undefined && expectedRevision !== section.revision) {
        const error = new Error('Settings revision conflict')
        error.code = 'SETTINGS_CONFLICT'
        throw error
      }
      const value = structuredClone(section.value)
      for (const op of ops) {
        let target = value
        for (const key of op.path.slice(0, -1)) target = target[key] ??= {}
        const key = op.path.at(-1)
        if (op.op === 'set') target[key] = structuredClone(op.value)
        else if (op.op === 'unset') delete target[key]
        else assert.fail(`Unexpected settings operation: ${op.op}`)
      }
      sections.set(ns, { value, revision: section.revision + 1 })
      this.ctx.emit('settings/document-updated', ns, section.revision + 1)
    }
  }

  class MemoryCredentials extends CredentialProvider {
    async resolve() { return undefined }
    async describe() { return { configured: false, writable: true } }
    async set() { }
    async unset() { }
  }

  class TimerService extends Service {
    constructor(ctx) { super(ctx, 'timer'); ctx.mixin('timer', ['timeout']) }
    timeout(callback, delay) {
      return this.ctx.effect(() => {
        const timer = setTimeout(callback, delay)
        return () => clearTimeout(timer)
      })
    }
  }

  class ConnectionService extends Service {
    constructor(ctx) {
      super(ctx, 'connection')
      this.fetch = { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } }
    }
  }

  const previousFetch = globalThis.fetch
  const requests = []
  const catalogHeaders = []
  let inferenceCalls = 0
  let inferenceMode = 'complete'
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    assert.ok(url.startsWith('https://cpa-fixture.invalid/'), `Unexpected external request: ${url}`)
    if (/\/models(?:\?|$)/.test(url)) { catalogHeaders.push(new Headers(init.headers)); return Response.json({ models: [{ slug: 'fixture-model', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'ultra' }] }] }) }
    assert.match(url, /\/responses$/)
    inferenceCalls++
    if (inferenceMode === 'error') return new Response('unavailable', { status: 503 })
    if (inferenceMode === 'abort') return new Promise((resolve, reject) => {
      const signal = init?.signal ?? input.signal
      if (signal.aborted) reject(new DOMException('Aborted', 'AbortError'))
      else signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    })
    if (inferenceMode === 'incomplete') return new Response('event: response.created\ndata: {"type":"response.created","response":{"id":"resp_partial","object":"response","created_at":0,"model":"fixture-model","status":"in_progress","output":[],"usage":null}}\n\n', { headers: { 'content-type': 'text/event-stream' } })
    const payload = input instanceof Request ? await input.clone().json() : JSON.parse(init.body)
    const headers = new Headers(input instanceof Request ? input.headers : init.headers)
    requests.push({ payload, authorization: headers.get('authorization') })
    const item = { type: 'message', id: 'msg_fixture', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'OK', annotations: [] }] }
    const response = { id: 'resp_fixture', object: 'response', created_at: 0, model: 'fixture-model', status: 'completed', output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } }
    const events = [
      { type: 'response.created', response: { ...response, status: 'in_progress', output: [], usage: null } },
      { type: 'response.output_item.added', output_index: 0, item: { ...item, status: 'in_progress', content: [] } },
      { type: 'response.content_part.added', item_id: item.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
      { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: 'OK' },
      { type: 'response.output_item.done', output_index: 0, item }, { type: 'response.completed', response },
    ]
    return new Response(events.map((event, sequence_number) => `event: ${event.type}\ndata: ${JSON.stringify({ ...event, sequence_number })}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream', 'x-request-id': 'fixture-request' } })
  }

  const ctx = new Context()
  const fibers = []
  try {
    fibers.push(ctx.plugin(LlmRuntime), ctx.plugin(MemorySettings), ctx.plugin(MemoryCredentials), ctx.plugin(TimerService), ctx.plugin(ConnectionService))
    await Promise.all(fibers.map((fiber) => fiber.await()))
    const plugin = ctx.plugin({ name, inject, Config, apply }, { refreshIntervalMs: 0 })
    fibers.push(plugin)
    await plugin.await()

    const command = routes.get('/api/cliproxyapi/command')
    assert.ok(command, 'CPA must expose the authenticated command route for its own connection')
    const result = await command.fetch(new Request('http://host/api/cliproxyapi/command', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'save-connection', expectedRevision: 0, operationId: 'fixture-save',
        baseURL: 'https://cpa-fixture.invalid/v1', authEdit: { type: 'none' },
        policy: { headers: { 'X-Tenant': 'tenant-a' }, defaultContextWindow: 12345, defaultInput: ['text', 'image'] }, selectionChanges: { 'fixture-model': true },
      }),
    }))
    assert.equal(result.ok, true, 'saving the keyless own connection must succeed')
    assert.deepEqual(sections.get('llm-pi-ai').value.providers, {}, 'saving CPA must not create a generic profile')

    const deadline = Date.now() + 2000
    while (!ctx.llm.listProviders().some((provider) => provider.id === 'CLIProxyAPI') && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    assert.ok(ctx.llm.listProviders().some((provider) => provider.id === 'CLIProxyAPI'), 'a ready own connection must publish the native route')
    assert.ok((await ctx.llm.listModels('CLIProxyAPI')).some((model) => model.id === 'fixture-model'))
    const schema = { type: 'object', properties: { mode: { type: 'string' } }, additionalProperties: false }
    const messages = [createUserMessage({ content: [{ type: 'text', text: 'Reply OK' }], source: { kind: 'user' } })]
    const tools = Array.from({ length: 320 }, (_, index) => ({ name: `probe_${index}`, description: 'Fixture', parameters: schema }))
    const options = { provider: 'CLIProxyAPI', model: 'fixture-model', reasoningEffort: 'max', messages, tools }
    const chunks = []
    for await (const chunk of ctx.llm.stream(options)) chunks.push(chunk)
    assert.ok(chunks.some((chunk) => chunk.type === 'text-delta'))
    assert.equal(chunks.at(-1).type, 'finish')
    assert.equal(chunks.at(-1).reason?.failure, undefined)
    assert.equal(requests.length, 1)
    assert.equal(requests[0].authorization, null)
    assert.equal(requests[0].payload.reasoning.effort, 'ultra')
    assert.equal(requests[0].payload.tools.length, 320)
    for (const [index, tool] of requests[0].payload.tools.entries()) {
      assert.equal(tool.name, `probe_${index}`)
      assert.equal(tool.strict, false)
      assert.deepEqual(tool.parameters, schema)
    }
    const beforeUnsupported = inferenceCalls
    const unsupported = []
    for await (const chunk of ctx.llm.stream({ ...options, reasoningEffort: 'medium' })) unsupported.push(chunk)
    assert.equal(unsupported.at(-1)?.reason?.failure?.code, 'UNSUPPORTED_REASONING_EFFORT')
    assert.equal(inferenceCalls, beforeUnsupported)
    const beforeError = inferenceCalls
    inferenceMode = 'error'
    try { for await (const _chunk of ctx.llm.stream(options)) { } } catch { }
    assert.equal(inferenceCalls - beforeError, 1, 'an upstream failure must not trigger an SDK retry')
    inferenceMode = 'incomplete'
    const incomplete = []
    try { for await (const chunk of ctx.llm.stream({ ...options, reasoningEffort: 'low' })) incomplete.push(chunk) } catch { }
    assert.ok(!incomplete.some((chunk) => chunk.type === 'finish' && !chunk.reason?.failure))
    inferenceMode = 'abort'
    const controller = new AbortController()
    let abortError
    const abortChunks = []
    const aborted = (async () => { try { for await (const chunk of ctx.llm.stream({ ...options, signal: controller.signal })) abortChunks.push(chunk) } catch (error) { abortError = error } })()
    setTimeout(() => controller.abort(), 10)
    await aborted
    assert.equal(abortError?.code ?? abortChunks.at(-1)?.reason?.failure?.code, 'ABORTED')
    inferenceMode = 'complete'
    const post = async (body) => {
      const response = await command.fetch(new Request('http://host/api/cliproxyapi/command', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      }))
      return { status: response.status, body: await response.json() }
    }
    const stateRoute = routes.get('/api/cliproxyapi/state')
    const initial = await (await stateRoute.fetch(new Request('http://host/api/cliproxyapi/state'))).json()
    assert.equal(initial.value.status, 'ready')
    assert.equal(initial.value.authMode, 'none')
    assert.equal(catalogHeaders[0].get('x-tenant'), 'tenant-a')
    assert.equal(initial.value.models[0].contextWindow, 12345)
    assert.deepEqual(initial.value.models[0].inputModalities, ['text', 'image'])
    assert.ok(initial.value.diagnostics.some((entry) => entry.stage === 'sse-completed'))
    assert.ok(initial.value.diagnostics.some((entry) => entry.stage === 'http' && entry.requestId === 'fixture-request'))
    assert.ok(initial.value.diagnostics.some((entry) => entry.stage === 'sse-incomplete'))
    assert.ok(initial.value.diagnostics.some((entry) => entry.stage === 'abort'))
    ctx.settings.documentPath = undefined
    const refreshed = await post({ type: 'refresh-models', connectionGeneration: initial.value.generation })
    assert.equal(refreshed.status, 200)
    assert.equal(refreshed.body.value.status, 'ready')
    assert.equal(refreshed.body.value.catalog.freshness, 'fresh')
    assert.equal(refreshed.body.value.catalog.error.code, 'CACHE_UNAVAILABLE')
    assert.ok(refreshed.body.value.models.some((model) => model.id === 'fixture-model'))
    ctx.settings.documentPath = join(home, 'profile.yml')
    const disabled = await post({ type: 'save-selection', expectedRevision: initial.value.revision, operationId: 'all-off', selectionChanges: { 'fixture-model': false } })
    assert.equal(disabled.body.value.status, 'no-models')
    assert.equal(ctx.llm.listProviders().some((provider) => provider.id === 'CLIProxyAPI'), false)
    const conflict = await post({ type: 'save-selection', expectedRevision: initial.value.revision, operationId: 'conflict', selectionChanges: { 'fixture-model': true } })
    assert.equal(conflict.status, 409)
    const enabled = await post({ type: 'save-selection', expectedRevision: disabled.body.value.revision, operationId: 'restore', selectionChanges: { 'fixture-model': true } })
    assert.equal(enabled.body.value.status, 'ready')
    assert.ok(ctx.llm.listProviders().some((provider) => provider.id === 'CLIProxyAPI'))
    const stale = await post({ type: 'refresh-models', connectionGeneration: initial.value.generation })
    assert.equal(stale.status, 409)
  } finally {
    for (const fiber of fibers.reverse()) await fiber.dispose().catch(() => { })
    globalThis.fetch = previousFetch
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    await rm(home, { recursive: true, force: true })
  }
})
