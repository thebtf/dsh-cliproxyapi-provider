import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const find = (node, predicate) => Array.isArray(node) ? node.flatMap((child) => find(child, predicate)) : !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...find(node.children, predicate)]
const text = (node) => Array.isArray(node) ? node.map(text).join(' ') : node && typeof node === 'object' ? text(node.children) : String(node ?? '')
const state = () => ({ revision: 7, generation: 'g1', configured: true, enabled: true, baseURL: 'https://old.example/v1', authMode: 'record', keyConfigured: true, keyWritable: true, policy: { timeout: 12 }, modelSelection: { absent: false, two: false }, status: 'ready', catalog: { freshness: 'fresh' }, diagnostics: [], models: [{ id: 'one', name: 'Alpha', contextWindow: 10000, maxTokens: 500, inputModalities: ['text', 'image'], catalogSources: { contextWindow: 'default', maxTokens: 'cpa' }, reasoningEfforts: { high: 'ultra' }, catalogMetadata: { description: '<img src=x>', supported_reasoning_levels: [{ effort: 'ultra', description: 'deep thought' }], nested: { extra: 'unknown field' } } }, { id: 'two', name: 'Beta' }] })

async function harness(initial = state()) {
  let definition
  const calls = []
  let current = initial
  let reply = null
  globalThis.window = {
    __ModuleLoader__: { load(value) { definition = value } }, __DSH_TRANSPORT__: {
      async fetch(path, options) {
        assert.equal(options.credentials, 'same-origin')
        if (path.endsWith('/state')) return { async json() { return { ok: true, value: current } } }
        assert.equal(path, '/api/cliproxyapi/command')
        const body = JSON.parse(options.body); calls.push(body)
        if (reply) return { async json() { return reply(body) } }
        if (body.type === 'preview-models') return { async json() { return { ok: true, value: current.models } } }
        current = { ...current, revision: current.revision + 1, operationId: body.operationId }
        return { async json() { return { ok: true, value: current } } }
      }
    }
  }
  await import(`../client.js?test=${Math.random()}`)
  const states = []; let cursor = 0; const effects = []
  const React = { Fragment: 'fragment', createElement(type, props, ...children) { return { type, props: props || {}, children } }, useState(initialValue) { const i = cursor++; if (!(i in states)) states[i] = initialValue; return [states[i], (next) => { states[i] = typeof next === 'function' ? next(states[i]) : next }] }, useRef(value) { const i = cursor++; return states[i] ??= { current: value } }, useEffect(fn) { const i = cursor++; if (!(i in states)) { states[i] = true; effects.push(fn) } } }
  const primitives = { Button: 'button', Input: 'input', Checkbox: 'checkbox', Tag: 'tag', StateDot: 'statedot' }
  const plugin = definition.factory((id) => id === 'react' ? React : primitives)
  const registrations = {}; const dictionaries = {}; let opened = 0
  const scope = { getSnapshot() { return { status: 'ready', writable: true } }, subscribe() { return () => { } } }
  plugin.apply({ configForms: { get(ns) { assert.equal(ns, 'llm-cliproxyapi'); return scope }, whileServed(names, fn) { assert.deepEqual(names, ['llm-cliproxyapi']); return fn() } }, pluginNavigation: { openList() { opened++ } }, locale: { register(ns, value) { dictionaries[ns] = value; return () => { } }, bind() { return (key) => key } }, slots: { inject(_name, fn) { return fn() }, register(options, component) { registrations[options.name] = { options, component }; return () => { } } }, effect(fn) { return fn() } })
  const item = registrations['plugins.item']
  const render = (language) => { cursor = 0; return item.component({ t: (key) => language ? dictionaries['settings.cliProxyApi'][language][key] || key : key, useScope: () => ({ status: 'ready', writable: true }) }) }
  render(); effects.splice(0).forEach((effect) => effect()); await new Promise((resolve) => setTimeout(resolve, 0))
  const button = (tree, label) => find(tree, (node) => node.type === 'button' && text(node) === label)[0]
  const input = (tree, type) => find(tree, (node) => node.type === 'input' && node.props.type === type)[0]
  const select = (tree, name) => find(tree, (node) => node.type === 'select' && node.props.name === name)[0]
  return { calls, render, button, input, select, registrations, dictionaries, get opened() { return opened }, setReply(value) { reply = value }, setCurrent(value) { current = value } }
}

test('combined save includes CAS, credential action, policy and zero-model selection', async () => {
  const h = await harness(); let tree = h.render()
  h.button(tree, 'deselectAll').props.onClick(); tree = h.render()
  h.select(tree, 'authAction').props.onChange({ currentTarget: { value: 'replace' } }); tree = h.render()
  h.input(tree, 'password').props.onChange({ currentTarget: { value: 'new-key' } }); tree = h.render()
  await find(tree, (n) => n.type === 'form')[0].props.onSubmit({ preventDefault() { } })
  assert.equal(h.calls.length, 1)
  assert.deepEqual({ ...h.calls[0], operationId: '<id>' }, { type: 'save-connection', expectedRevision: 7, operationId: '<id>', baseURL: 'https://old.example/v1', authEdit: { type: 'replace', key: 'new-key' }, policy: { timeout: 12, api: 'openai-responses' }, selectionChanges: { one: false, two: false } })
  assert.ok(h.calls[0].operationId)
})

test('conflict and UNKNOWN preserve draft and expose readback and operation id', async () => {
  for (const code of ['CONFLICT', 'UNKNOWN']) {
    const h = await harness(); let tree = h.render()
    h.button(tree, 'deselectAll').props.onClick(); tree = h.render()
    h.setReply(() => ({ ok: false, error: { code, message: 'safe' } }))
    await find(tree, (n) => n.type === 'form')[0].props.onSubmit({ preventDefault() { } })
    tree = h.render(); assert.match(text(tree), new RegExp(code === 'CONFLICT' ? 'conflict' : 'uncertain'))
    assert.match(text(tree), new RegExp(h.calls[0].operationId)); assert.match(text(tree), /revision/)
    assert.deepEqual(find(tree, (n) => n.type === 'checkbox' && n.props.label.startsWith('enabled ')).map((n) => n.props.checked), [false, false])
  }
})

test('preview requires consent before reuse at a changed endpoint', async () => {
  const h = await harness(); let tree = h.render()
  h.input(tree, 'url').props.onChange({ currentTarget: { value: 'https://new.example/v1' } }); tree = h.render()
  await h.button(tree, 'loadModels').props.onClick(); assert.equal(h.calls.length, 0)
  tree = h.render(); assert.match(text(tree), /reuseRequired/)
  find(tree, (n) => n.type === 'checkbox' && n.props.label === 'reuseConsent')[0].props.onChange(true); tree = h.render()
  await h.button(tree, 'loadModels').props.onClick()
  assert.deepEqual(h.calls[0], { type: 'preview-models', baseURL: 'https://new.example/v1', allowEndpointReuse: true })
})

test('metadata stays text, with provenance, effort and bulk search', async () => {
  const h = await harness(); let tree = h.render()
  assert.match(text(tree), /deep thought/); assert.match(text(tree), /unknown field/); assert.match(text(tree), /sourceDefault/)
  assert.ok(text(tree).includes('<img src=x>')); assert.equal(find(tree, (n) => n.type === 'img' || n.props.dangerouslySetInnerHTML).length, 0)
  h.input(tree, 'search').props.onChange({ currentTarget: { value: 'alpha' } }); tree = h.render()
  assert.equal(find(tree, (n) => n.type === 'checkbox').length, 1)
  h.button(tree, 'selectAll').props.onClick(); tree = h.render(); assert.match(text(tree), /2\s+\/\s+2\s+selectedCount/)
})

test('footer uses public Plugins list and dictionaries cover all status keys', async () => {
  const h = await harness(); const dict = h.dictionaries['settings.cliProxyApi']
  for (const language of ['en', 'ru', 'zh']) for (const key of ['statusNotConfigured', 'statusDisabled', 'statusMissingKey', 'statusLoading', 'statusReady', 'statusStale', 'statusReconfiguring', 'statusNoModels', 'statusError', 'activationFailed', 'conflict', 'uncertain']) assert.ok(dict[language][key], `${language}:${key}`)
  const footer = h.registrations['settings.models.footer']; assert.ok(footer)
  const props = footer.options.inject(); const tree = footer.component(props)
  h.button(tree, 'openSettings').props.onClick(); assert.equal(h.opened, 1); assert.match(text(tree), /chooseCPA/)
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /llm-pi-ai|MutationObserver|document\.|127\.0\.0\.1/)
})

test('every dictionary carries the same keys so no copy falls back to English', async () => {
  const h = await harness(); const dict = h.dictionaries['settings.cliProxyApi']
  const keys = Object.keys(dict.en).sort()
  for (const language of ['ru', 'zh']) assert.deepEqual(Object.keys(dict[language]).sort(), keys, language)
  for (const language of ['en', 'ru', 'zh']) for (const key of keys) assert.ok(String(dict[language][key]).trim(), `${language}:${key}`)
})

test('selection-only saves use new CAS and keep connection draft', async () => {
  const h = await harness(); let tree = h.render()
  h.input(tree, 'url').props.onChange({ currentTarget: { value: 'https://draft.example/v1' } }); tree = h.render()
  h.button(tree, 'deselectAll').props.onClick(); tree = h.render()
  await h.button(tree, 'saveSelection').props.onClick(); tree = h.render()
  assert.equal(h.calls[0].type, 'save-selection')
  assert.equal(h.calls[0].expectedRevision, 7)
  assert.deepEqual(h.calls[0].selectionChanges, { one: false, two: false })
  assert.equal(h.input(tree, 'url').props.value, 'https://draft.example/v1')
  await h.button(tree, 'saveSelection').props.onClick()
  assert.equal(h.calls[1].expectedRevision, 8)
  assert.notEqual(h.calls[0].operationId, h.calls[1].operationId)
})

test('saved state and activation failure are distinct', async () => {
  const h = await harness(); h.setReply((body) => ({ ok: true, value: { ...state(), revision: 8, operationId: body.operationId, status: 'error', activationError: { code: 'FAILED', message: 'safe' } } }))
  const tree = h.render(); await find(tree, (n) => n.type === 'form')[0].props.onSubmit({ preventDefault() { } })
  assert.match(text(h.render()), /saved/); assert.match(text(h.render()), /activationFailed/)
})

test('package locale metadata points to each translated detail', async () => {
  for (const language of ['en', 'ru', 'zh']) {
    const metadata = JSON.parse(await readFile(new URL(`../locale/${language}.json`, import.meta.url), 'utf8'))
    assert.equal(metadata.meta.detail, `details/${language}.md`)
    assert.ok(metadata.meta.description)
    assert.ok((await readFile(new URL(`../${metadata.meta.detail}`, import.meta.url), 'utf8')).length > 100)
  }
})

test('lost save retries the identical in-memory command and reconciles a committed readback', async () => {
  const h = await harness(); let tree = h.render()
  h.button(tree, 'deselectAll').props.onClick(); tree = h.render()
  h.select(tree, 'authAction').props.onChange({ currentTarget: { value: 'replace' } }); tree = h.render()
  h.input(tree, 'password').props.onChange({ currentTarget: { value: 'private-key' } }); tree = h.render()
  h.setReply(() => { throw new Error('network lost before delivery') })
  await find(tree, (n) => n.type === 'form')[0].props.onSubmit({ preventDefault() { } })
  tree = h.render(); assert.match(text(tree), /uncertain/); assert.equal(h.input(tree, 'password').props.value, 'private-key')
  assert.ok(h.button(tree, 'retryOperation')); assert.equal(h.input(tree, 'url').props.disabled, true)
  h.setReply((body) => { h.setCurrent({ ...state(), revision: 8, operationId: body.operationId }); throw new Error('response lost after commit') })
  await h.button(tree, 'retryOperation').props.onClick()
  assert.deepEqual(h.calls[1], h.calls[0])
  tree = h.render(); assert.match(text(tree), /saved/); assert.equal(h.input(tree, 'url').props.disabled, false)
  assert.equal(h.button(tree, 'retryOperation'), undefined)
  assert.equal(h.input(tree, 'password'), undefined)
})

test('newer competing operation keeps draft until explicit return and deliberate CAS save', async () => {
  const h = await harness(); let tree = h.render()
  h.input(tree, 'url').props.onChange({ currentTarget: { value: 'https://draft.example/v1' } }); tree = h.render()
  h.button(tree, 'deselectAll').props.onClick(); tree = h.render()
  h.setReply(() => { h.setCurrent({ ...state(), revision: 9, operationId: 'other-operation' }); throw new Error('lost response') })
  await find(tree, (n) => n.type === 'form')[0].props.onSubmit({ preventDefault() { } })
  tree = h.render(); assert.match(text(tree), /conflictPending/); assert.doesNotMatch(text(tree), /saved/)
  assert.equal(h.input(tree, 'url').props.value, 'https://draft.example/v1')
  assert.deepEqual(find(tree, (n) => n.type === 'checkbox' && n.props.label.startsWith('enabled ')).map((n) => n.props.checked), [false, false])
  assert.equal(find(tree, (n) => n.type === 'checkbox' && n.props.label === 'reuseConsent')[0].props.checked, false)
  await h.button(tree, 'returnToEdit').props.onClick(); tree = h.render()
  assert.match(text(tree), /conflict/); assert.equal(h.calls.length, 1); assert.equal(h.input(tree, 'url').props.disabled, false)
  h.setReply(null)
  await find(tree, (n) => n.type === 'form')[0].props.onSubmit({ preventDefault() { } })
  assert.equal(h.calls[1].expectedRevision, 9); assert.notEqual(h.calls[1].operationId, h.calls[0].operationId)
  assert.deepEqual(h.calls[1].selectionChanges, { one: false, two: false })
})

test('structured diagnostics and catalog codes are localized without rendering unsafe fields', async () => {
  const codes = { CATALOG_AUTH: 'catalogAuth', CATALOG_TIMEOUT: 'catalogTimeout', CATALOG_TRANSPORT: 'catalogTransport', CATALOG_INVALID_RESPONSE: 'catalogInvalidResponse', CATALOG_TOO_LARGE: 'catalogTooLarge' }
  for (const [code, key] of Object.entries(codes)) {
    const h = await harness({
      ...state(), catalog: { error: { code, message: '<raw-body>' } }, diagnostics: [
        { stage: 'http', status: 503, requestId: 'req-123', at: 0, message: '<server-body>', stack: '<stack>' },
        { stage: 'sse-incomplete' }, { stage: 'sse-failed' }, { stage: 'abort' }, { stage: 'payload', toolCount: 3 },
        { stage: 'http', requestId: '<img src=x>', body: '<secret-body>' }, { stage: '<unknown>', message: '<unsafe>' }
      ]
    })
    const tree = h.render(); const rendered = text(tree)
    for (const expected of [key, 'diagnosticHttp', '503', 'diagnosticRequestId', 'req-123', 'diagnosticAt', 'diagnosticSseIncomplete', 'diagnosticSseFailed', 'diagnosticAbort', 'diagnosticToolCount']) assert.ok(rendered.includes(expected), expected)
    for (const forbidden of ['<raw-body>', '<server-body>', '<stack>', '<secret-body>', '<unsafe>']) assert.ok(!rendered.includes(forbidden), forbidden)
    assert.equal(find(tree, (n) => n.type === 'img' || n.props.dangerouslySetInnerHTML).length, 0)
    for (const lang of ['en', 'ru', 'zh']) {
      const dictionary = h.dictionaries['settings.cliProxyApi'][lang]
      for (const name of [...Object.values(codes), 'retryOperation', 'returnToEdit', 'conflictPending', 'diagnosticHttp', 'diagnosticSseIncomplete', 'diagnosticAbort', 'diagnosticStatus', 'diagnosticRequestId', 'diagnosticAt', 'diagnosticToolCount']) assert.ok(dictionary[name], `${lang}:${name}`)
      const translated = text(h.render(lang))
      for (const name of [key, 'diagnosticHttp', 'diagnosticSseIncomplete', 'diagnosticAbort', 'diagnosticRequestId']) assert.ok(translated.includes(dictionary[name]), `${lang}:${name}`)
      assert.ok(translated.includes('req-123')); assert.ok(!translated.includes('<server-body>'))
    }
  }
})

test('changing endpoint after returning to edit clears a replacement key', async () => {
  const h = await harness(); let tree = h.render()
  h.select(tree, 'authAction').props.onChange({ currentTarget: { value: 'replace' } }); tree = h.render()
  h.input(tree, 'password').props.onChange({ currentTarget: { value: 'private-key' } }); tree = h.render()
  h.setReply(() => { throw new Error('lost') })
  await find(tree, (n) => n.type === 'form')[0].props.onSubmit({ preventDefault() { } }); tree = h.render()
  await h.button(tree, 'returnToEdit').props.onClick(); tree = h.render()
  assert.equal(h.input(tree, 'password').props.value, 'private-key')
  h.input(tree, 'url').props.onChange({ currentTarget: { value: 'https://different.example/v1' } }); tree = h.render()
  assert.equal(h.input(tree, 'password').props.value, '')
})
