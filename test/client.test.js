import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const primitives = { Button: 'button', Input: 'input', Checkbox: 'checkbox', Tag: 'tag' }
const mockRequire = (React) => (id) => id === 'react' ? React : id === '@deepseek-ai/dsh-client-ui-primitives' ? primitives : assert.fail(`Unexpected module: ${id}`)
const bindCatalog = (connection) => {
  window.__DSH_TRANSPORT__ = {
    async fetch(path, options) {
      assert.equal(path, '/api/cliproxyapi/catalog')
      assert.equal(options.method, 'POST')
      assert.equal(options.credentials, 'same-origin')
      assert.equal(options.cache, 'no-store')
      assert.equal(options.headers['content-type'], 'application/json')
      const result = await connection.rpc.call('/api', 'cliproxyapi/catalog', JSON.parse(options.body))
      return { ok: true, async json() { return result } }
    }
  }
}

test('client bundle registers a served-namespace Plugins item', async () => {
  let definition
  globalThis.window = {
    __ModuleLoader__: {
      load(value) {
        definition = value
      },
    },
  }
  try {
    await import('../client.js')
    const plugin = definition.factory(mockRequire({}))
    assert.deepEqual(plugin.inject, ['slots', 'locale', 'remote', 'remote.credentials', 'configForms'])

    const registrations = []
    const injections = []
    const slots = {
      inject(name, callback) {
        injections.push(name)
        return callback()
      },
      register(options, component) {
        registrations.push({ options, component })
        return () => { }
      },
    }
    const locale = {
      register(namespace, dictionaries) {
        assert.ok(['settings.cliProxyApi', 'llm-cliproxyapi'].includes(namespace))
        assert.deepEqual(Object.keys(dictionaries).sort(), ['en', 'zh'])
        return () => { }
      },
      bind(namespace) {
        assert.ok(['settings.cliProxyApi', 'llm-cliproxyapi'].includes(namespace))
        return (key) => key === 'description' ? namespace : key
      },
    }
    const scope = {
      getSnapshot() {
        return { status: 'loading', value: undefined, revision: undefined, writable: false }
      },
      subscribe() {
        return () => { }
      },
    }
    const configForms = {
      get(namespace) {
        assert.ok(['llm-pi-ai', 'llm-cliproxyapi'].includes(namespace))
        return scope
      },
      whileServed(namespaces, register) {
        assert.deepEqual(namespaces, ['llm-pi-ai', 'llm-cliproxyapi'])
        return register(new Set(namespaces))
      },
    }
    const ctx = {
      remote: { $on() { return () => { } } },
      slots,
      locale,
      configForms,
      effect(factory) {
        return factory()
      },
    }
    plugin.apply(ctx)
    assert.deepEqual(injections, ['plugins.item'])
    assert.equal(registrations.length, 1)
    assert.equal(registrations[0].options.name, 'plugins.item')
    assert.equal(registrations[0].options.id, 'cliproxyapi')
    assert.equal(registrations[0].options.order, 30)
    assert.equal(typeof registrations[0].options.label, 'function')
    assert.equal(typeof registrations[0].options.description, 'function')
    assert.equal(registrations[0].options.description(), 'llm-cliproxyapi')
    assert.equal(typeof registrations[0].options.inject, 'function')
    assert.equal(typeof registrations[0].component, 'function')
    assert.deepEqual(registrations[0].options.inject().hooks, { scope, selectionScope: scope })
  } finally {
    delete globalThis.window
  }
})

test('client follows the served pi-ai entry on the Plugins page', async () => {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /setInterval\s*\(/)
  assert.doesNotMatch(source, /document\./)
  assert.doesNotMatch(source, /MutationObserver/)
  assert.doesNotMatch(source, /querySelector(All)?\s*\(/)
  assert.doesNotMatch(source, /modelsHeading|configuredRows|BOOTSTRAP_ATTRIBUTE|HIDDEN_ATTRIBUTE/)
  assert.match(source, /plugins\.item/)
  assert.match(source, /SETTINGS_SUMMARY_NS/)
  assert.match(source, /ctx\.configForms/)
  assert.match(source, /configForms\.whileServed/)
  assert.match(source, /slots\.inject\(SETTINGS_SLOT/)
  assert.match(source, /const DISCOVERY_NS = 'llm-cliproxyapi'/)
  assert.match(source, /window\.__DSH_TRANSPORT__\?\.fetch/)
  assert.match(source, /const inject = \['slots', 'locale', 'remote', 'remote\.credentials', 'configForms'\]/)
  assert.match(source, /require\('@deepseek-ai\/dsh-client-ui-primitives'\)/)
  assert.doesNotMatch(source, /label-inverse, #fff/)
  assert.match(source, /input: Array\.isArray\(model\.inputModalities\)[\s\S]*\? \[\.\.\.model\.inputModalities\][\s\S]*: \['text'\]/)
  assert.match(source, /imageCapability: '会根据模型目录中的图片能力声明自动启用图片输入。'/)
  assert.match(source, /role: 'note' }, t\('imageCapability'\)/)
  assert.match(source, /scope\.mutate\(/)
  assert.match(source, /hooks: \{ scope, selectionScope \}/)
  assert.doesNotMatch(source, /useSyncExternalStore/)
  assert.doesNotMatch(source, /connection\.api/)
  assert.doesNotMatch(source, /remote\.\$on\('settings\/document-updated'/)
  assert.match(source, /remote\.\$on\('credentials\/reference-updated'/)
  assert.match(source, /role: 'status'/)
  assert.match(source, /existing DSH sessions may fail/)
  assert.match(source, /Direct CPA API calls are not blocked/)
  assert.match(source, /model selection, API key or profile may already have changed/)
})

test('saving uses the CLIProxyAPI discovery instead of the pi-ai generic listing', async () => {
  let definition
  globalThis.window = { __ModuleLoader__: { load(value) { definition = value } } }
  try {
    await import('../client.js?catalog-discovery-test')
    const states = []
    const React = {
      createElement(type, props, ...children) { return { type, props: props || {}, children } },
      useState(initial) {
        const index = states.length
        states.push(initial)
        return [initial, (value) => { states[index] = value }]
      },
      useEffect() { },
      useRef(initial) { return { current: initial } },
    }
    const plugin = definition.factory(mockRequire(React))
    let component
    const listeners = new Set()
    const scope = {
      mutations: [],
      snapshot: { status: 'ready', revision: 1, writable: true, value: { providers: { CLIProxyAPI: { headers: { Authorization: 'Bearer custom', 'X-Custom': 'kept' }, compat: { supportsStore: false } } } } },
      getSnapshot() { return this.snapshot },
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
      publish(profile) {
        this.snapshot = {
          ...this.snapshot, revision: this.snapshot.revision + 1,
          value: { providers: { CLIProxyAPI: profile } },
        }
        for (const listener of listeners) listener()
      },
      async mutate(ops) {
        this.mutations.push(...ops)
        this.publish(ops[0].value)
        return true
      },
    }
    const selectionScope = {
      snapshot: { status: 'ready', revision: 1, writable: true, value: { modelSelection: {} } },
      getSnapshot() { return this.snapshot },
      async mutate() { throw new Error('unchanged selection should not be written') },
    }
    const connection = {
      rpc: {
        async call(path, endpoint, request) {
          assert.equal(path, '/api')
          assert.equal(endpoint, 'cliproxyapi/catalog')
          assert.deepEqual(request, { baseURL: 'http://127.0.0.1:8317/v1' })
          return { ok: true, value: [{ id: 'thinking-model', name: 'Thinking Model', reasoningEfforts: { high: 'ultra' } }] }
        }
      }
    }
    bindCatalog(connection)
    const remote = { credentials: { async describe() { return { ok: true, value: {} } } } }
    plugin.apply({
      remote, connection,
      configForms: {
        get(namespace) { return namespace === 'llm-cliproxyapi' ? selectionScope : scope },
        whileServed(_namespaces, register) { return register() },
      },
      locale: { bind() { return (key) => key }, register() { return () => { } } },
      slots: {
        inject(_name, register) { return register() },
        register(_options, view) { component = view; return () => { } },
      },
      effect(factory) { return factory() },
    })
    const tree = component({
      scope, selectionScope, remote, connection, t: (key) => key,
      useScope: () => ({ status: 'ready', writable: true, value: {} }),
      useSelectionScope: () => selectionScope.snapshot,
    })
    const form = tree.children.find((child) => child?.type === 'form')
    assert.ok(form)
    const submitted = form.props.onSubmit({ preventDefault() { } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.deepEqual(scope.mutations[0].value.models[0].reasoningEfforts, { high: 'ultra' })
    assert.equal(scope.mutations.length, 1)
    assert.equal(scope.mutations[0].value.headers['x-dsh-provider-cpa-sync'].startsWith('rich:'), true)
    assert.equal(scope.mutations[0].value.headers.Authorization, 'Bearer custom')
    assert.equal(scope.mutations[0].value.headers.authorization, undefined)
    assert.equal(scope.mutations[0].value.headers['X-Custom'], 'kept')
    assert.deepEqual(scope.mutations[0].value.compat, { supportsStore: false, supportsStrictMode: true })
    assert.equal(states[4].text, '')
    assert.equal(listeners.size, 1)
    scope.publish({
      ...scope.mutations[0].value,
      headers: {},
      models: [{ id: 'thinking-model', name: 'Thinking Model', input: ['text', 'image'], reasoningEfforts: { high: 'high' } }],
    })
    await submitted
    assert.equal(states[4].text, 'saved')
    assert.equal(listeners.size, 0)
  } finally {
    delete globalThis.window
  }
})

test('client uses direct remote results and writes the bootstrap through its bound scope', async () => {
  let definition
  globalThis.window = {
    __ModuleLoader__: {
      load(value) {
        definition = value
      },
    },
  }
  try {
    await import('../client.js?initial-profile-remote-test')
    const plugin = definition.factory(mockRequire({}))
    assert.equal(plugin.installInitialProfile, undefined)
    assert.equal(plugin.settingsTab, undefined)
  } finally {
    delete globalThis.window
  }
})

test('model form retains absent choices and rejects disabling every model', async () => {
  let definition
  globalThis.window = { __ModuleLoader__: { load(value) { definition = value } } }
  try {
    await import('../client.js?selection-form-test')
    const states = []
    let cursor = 0
    const React = {
      createElement(type, props, ...children) { return { type, props: props || {}, children } },
      useState(initial) {
        const index = cursor++
        if (!(index in states)) states[index] = initial
        return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value }]
      },
      useRef(initial) {
        const index = cursor++
        if (!(index in states)) states[index] = { current: initial }
        return states[index]
      },
      useEffect() { },
    }
    let component
    const listeners = new Set()
    const events = []
    let credentialFailure = false
    let selectionFailure = false
    const scope = {
      snapshot: {
        status: 'ready', revision: 1, writable: true, value: {
          providers: {
            CLIProxyAPI: {
              baseURL: 'http://127.0.0.1:8317/v1', headers: { Authorization: 'Bearer dsh-cliproxyapi-no-key', 'X-Custom': 'kept' },
              compat: { supportsStore: false }, retryPolicy: { mode: 'always' }, defaultContextWindow: 9000,
              modelOverrides: { two: { name: 'Unsupported override' } },
            }
          }
        }
      }, mutations: [],
      getSnapshot() { return this.snapshot },
      subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
      async mutate(ops, revision) {
        assert.equal(revision, this.snapshot.revision)
        events.push('profile')
        this.mutations.push(...ops)
        this.snapshot = { ...this.snapshot, revision: this.snapshot.revision + 1, value: { providers: { CLIProxyAPI: ops[0].value } } }
        return true
      },
    }
    const selectionScope = {
      snapshot: { status: 'ready', revision: 2, writable: true, value: { modelSelection: { absent: false } } }, mutations: [],
      getSnapshot() { return this.snapshot },
      async mutate(ops, revision) {
        assert.equal(revision, this.snapshot.revision)
        events.push('selection')
        if (selectionFailure) return false
        this.mutations.push(...ops)
        this.snapshot = { ...this.snapshot, revision: revision + 1, value: { ...this.snapshot.value, modelSelection: ops[0].value } }
        return true
      },
    }
    const remote = {
      credentials: {
        async describe() { return { ok: true, value: {} } },
        async set() { events.push('credential'); return { ok: !credentialFailure } },
      },
    }
    const connection = { rpc: { async call(path, endpoint) { assert.equal(path, '/api'); assert.equal(endpoint, 'cliproxyapi/catalog'); return { ok: true, value: [{ id: 'one', name: 'One' }, { id: 'two', name: 'Two' }] } } } }
    bindCatalog(connection)
    definition.factory(mockRequire(React)).apply({
      remote, connection,
      configForms: { get(ns) { return ns === 'llm-pi-ai' ? scope : selectionScope }, whileServed(_ns, fn) { return fn() } },
      locale: { bind() { return (key) => key }, register() { return () => { } } },
      slots: { inject(_name, fn) { return fn() }, register(_options, view) { component = view; return () => { } } },
      effect(fn) { return fn() },
    })
    const render = () => { cursor = 0; return component({ scope, selectionScope, remote, connection, t: (key) => key, useScope: () => scope.snapshot, useSelectionScope: () => selectionScope.snapshot }) }
    const find = (node, predicate) => {
      if (Array.isArray(node)) return node.flatMap((child) => find(child, predicate))
      if (!node || typeof node !== 'object') return []
      return [...(predicate(node) ? [node] : []), ...find(node.children, predicate)]
    }
    let tree = render()
    await find(tree, (node) => node.type === 'button' && node.props.type === 'button')[0].props.onClick()
    tree = render()
    const checkboxes = find(tree, (node) => node.type === 'checkbox')
    assert.equal(checkboxes.length, 2)
    assert.equal(checkboxes[0].props.checked, true)
    checkboxes[0].props.onChange(false)
    checkboxes[1].props.onChange(false)
    tree = render()
    await find(tree, (node) => node.type === 'form')[0].props.onSubmit({ preventDefault() { } })
    assert.equal(scope.mutations.length, 0)
    assert.equal(selectionScope.mutations.length, 0)
    assert.equal(states[4].text, 'needOneModel')
    tree = render()
    find(tree, (node) => node.type === 'checkbox')[1].props.onChange(true)
    find(tree, (node) => node.type === 'input' && node.props.type === 'password')[0].props.onChange({ currentTarget: { value: 'new-key' } })
    tree = render()
    const pending = find(tree, (node) => node.type === 'form')[0].props.onSubmit({ preventDefault() { } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.deepEqual(selectionScope.mutations[0].value, { absent: false, one: false, two: true })
    assert.deepEqual(scope.mutations[0].value.models.map((model) => model.id), ['two'])
    assert.deepEqual(events, ['selection', 'credential', 'profile'])
    assert.deepEqual(scope.mutations[0].value.headers['X-Custom'], 'kept')
    assert.equal(scope.mutations[0].value.headers.Authorization, undefined)
    assert.equal(scope.mutations[0].value.apiKeyEnv, 'DSH_CLIPROXY_API_KEY')
    assert.deepEqual(scope.mutations[0].value.compat, { supportsStore: false, supportsStrictMode: true })
    assert.deepEqual(scope.mutations[0].value.retryPolicy, { mode: 'always' })
    assert.equal(scope.mutations[0].value.modelOverrides, undefined)
    assert.equal(scope.mutations[0].value.defaultContextWindow, 9000)
    scope.snapshot = { ...scope.snapshot, revision: scope.snapshot.revision + 1, value: { providers: { CLIProxyAPI: { ...scope.mutations[0].value, headers: {} } } } }
    for (const listener of listeners) listener()
    await pending
    assert.equal(states[4].text, 'saved')
    events.length = 0
    credentialFailure = true
    tree = render()
    await find(tree, (node) => node.type === 'button' && node.props.type === 'button')[0].props.onClick()
    tree = render()
    assert.deepEqual(find(tree, (node) => node.type === 'checkbox').map((node) => node.props.checked), [false, true])
    find(tree, (node) => node.type === 'checkbox')[0].props.onChange(true)
    find(tree, (node) => node.type === 'input' && node.props.type === 'password')[0].props.onChange({ currentTarget: { value: 'another-key' } })
    tree = render()
    await find(tree, (node) => node.type === 'form')[0].props.onSubmit({ preventDefault() { } })
    assert.deepEqual(events, ['selection', 'credential'])
    assert.equal(scope.mutations.length, 1)
    assert.equal(states[4].text, 'partialSave')
    events.length = 0
    selectionFailure = true
    tree = render()
    await find(tree, (node) => node.type === 'form')[0].props.onSubmit({ preventDefault() { } })
    assert.deepEqual(events, ['selection'])
    assert.equal(states[4].text, 'partialSave')
  } finally {
    delete globalThis.window
  }
})

for (const { changeURL, foreignEdit } of [{ changeURL: false }, { changeURL: true }, { changeURL: true, foreignEdit: true }]) {
  test(`selection refresh racing ${foreignEdit ? 'a foreign profile edit' : changeURL ? 'a URL change' : 'a selection-only save'}`, async () => {
    let definition
    globalThis.window = { __ModuleLoader__: { load(value) { definition = value } } }
    try {
      await import(`../client.js?save-race-${changeURL}-${Boolean(foreignEdit)}`)
      const states = []
      let cursor = 0
      const React = {
        createElement(type, props, ...children) { return { type, props: props || {}, children } },
        useState(initial) {
          const index = cursor++
          if (!(index in states)) states[index] = initial
          return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value }]
        },
        useRef(initial) { const index = cursor++; return states[index] ??= { current: initial } },
        useEffect() { },
      }
      const listeners = new Set()
      const originalURL = 'http://127.0.0.1:8317/v1'
      const nextURL = changeURL ? 'http://127.0.0.1:9417/v1' : originalURL
      const scope = {
        snapshot: {
          status: 'ready', revision: 0, writable: true, value: {
            providers: {
              CLIProxyAPI: {
                baseURL: originalURL, models: [{ id: 'one' }], headers: { 'X-Custom': 'kept' }, compat: { supportsStore: false },
              }
            }
          }
        },
        attempts: [],
        getSnapshot() { return this.snapshot },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
        async mutate(ops, revision) {
          this.attempts.push({ ops, revision })
          if (this.attempts.length === 1) {
            const current = this.snapshot.value.providers.CLIProxyAPI
            this.snapshot = { ...this.snapshot, revision: 1, value: { providers: { CLIProxyAPI: { ...current, ...(foreignEdit ? { baseURL: 'http://other.example/v1' } : {}), models: [{ id: 'two', reasoning: true }] } } } }
            return false
          }
          assert.equal(revision, this.snapshot.revision)
          this.snapshot = { ...this.snapshot, revision: revision + 1, value: { providers: { CLIProxyAPI: ops[0].value } } }
          return true
        },
      }
      const selectionScope = {
        snapshot: { status: 'ready', revision: 0, writable: true, value: { modelSelection: {} } },
        getSnapshot() { return this.snapshot },
        async mutate(ops, revision) {
          assert.equal(revision, this.snapshot.revision)
          this.snapshot = { ...this.snapshot, revision: revision + 1, value: { modelSelection: ops[0].value } }
          return true
        },
      }
      const remote = {
        credentials: { async describe() { return { ok: true, value: {} } } },
      }
      const connection = { rpc: { async call(path, endpoint) { assert.equal(path, '/api'); assert.equal(endpoint, 'cliproxyapi/catalog'); return { ok: true, value: [{ id: 'one' }, { id: 'two' }] } } } }
      bindCatalog(connection)
      let component
      definition.factory(mockRequire(React)).apply({
        remote, connection, configForms: { get(ns) { return ns === 'llm-pi-ai' ? scope : selectionScope }, whileServed(_ns, fn) { return fn() } },
        locale: { bind() { return (key) => key }, register() { return () => { } } },
        slots: { inject(_name, fn) { return fn() }, register(_options, view) { component = view; return () => { } } },
        effect(fn) { return fn() },
      })
      const render = () => { cursor = 0; return component({ scope, selectionScope, remote, connection, t: (key) => key, useScope: () => scope.snapshot, useSelectionScope: () => selectionScope.snapshot }) }
      const find = (node, predicate) => Array.isArray(node) ? node.flatMap((child) => find(child, predicate)) : !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...find(node.children, predicate)]
      let tree = render()
      await find(tree, (node) => node.type === 'button' && node.props.type === 'button')[0].props.onClick()
      tree = render()
      find(tree, (node) => node.type === 'checkbox')[0].props.onChange(false)
      if (changeURL) find(tree, (node) => node.type === 'input' && node.props.type === 'url')[0].props.onChange({ currentTarget: { value: nextURL } })
      tree = render()
      const pending = find(tree, (node) => node.type === 'form')[0].props.onSubmit({ preventDefault() { } })
      await new Promise((resolve) => setTimeout(resolve, 0))
      if (foreignEdit) {
        await pending
        assert.equal(scope.attempts.length, 1)
        assert.equal(scope.snapshot.value.providers.CLIProxyAPI.baseURL, 'http://other.example/v1')
        assert.equal(states[4].text, 'partialSave')
        return
      }
      assert.deepEqual(scope.attempts.map((attempt) => attempt.revision), [0, 1])
      const profile = scope.attempts[1].ops[0].value
      assert.equal(profile.baseURL, nextURL)
      assert.deepEqual(profile.models.map((model) => model.id), ['two'])
      assert.equal(profile.headers['X-Custom'], 'kept')
      assert.deepEqual(profile.compat, { supportsStore: false, supportsStrictMode: true })
      assert.notEqual(states[4].text, 'saved')
      scope.snapshot = { ...scope.snapshot, revision: 3, value: { providers: { CLIProxyAPI: { ...profile, models: [{ id: 'one' }], headers: { 'X-Custom': 'kept' } } } } }
      for (const listener of listeners) listener()
      assert.notEqual(states[4].text, 'saved')
      scope.snapshot = { ...scope.snapshot, revision: 3, value: { providers: { CLIProxyAPI: { ...profile, headers: { 'X-Custom': 'kept' } } } } }
      for (const listener of listeners) listener()
      await pending
      assert.equal(states[4].text, 'saved')
    } finally {
      delete globalThis.window
    }
  })
}

test('catalog search, bulk choices and structured metadata preserve the draft', async () => {
  let definition
  globalThis.window = { __ModuleLoader__: { load(value) { definition = value } } }
  try {
    await import('../client.js?rich-catalog-test')
    const states = []
    let cursor = 0
    const React = {
      Fragment: 'fragment',
      createElement(type, props, ...children) { return { type, props: props || {}, children } },
      useState(initial) { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], (next) => { states[index] = typeof next === 'function' ? next(states[index]) : next }] },
      useRef(initial) { const index = cursor++; return states[index] ??= { current: initial } },
      useEffect() { },
    }
    const malicious = '<img src=x onerror=alert(1)>'
    const models = [
      { id: 'one', name: 'Alpha', contextWindow: 10000, maxTokens: 500, inputModalities: ['text', 'image'], catalogSources: { contextWindow: 'default', maxTokens: 'cpa', inputModalities: 'cpa' }, reasoningEfforts: { max: 'ultra' }, catalogMetadata: { description: malicious, default_reasoning_level: 'ultra', supported_reasoning_levels: [{ effort: 'ultra', description: 'deep thought' }], extra: { nested: ['unknown field', malicious] } } },
      { id: 'two', name: 'Beta', contextWindow: 20000, maxTokens: 1000, inputModalities: ['text'], catalogMetadata: {} },
    ]
    let fail = false
    const connection = { rpc: { async call() { return fail ? { ok: false } : { ok: true, value: models } } } }
    bindCatalog(connection)
    let component
    const scope = { snapshot: { status: 'ready', writable: true, revision: 1, value: {} }, getSnapshot() { return this.snapshot }, async mutate() { assert.fail('must not write empty catalog') } }
    const selectionScope = { snapshot: { status: 'ready', writable: true, revision: 1, value: { modelSelection: { absent: false, two: false } } }, getSnapshot() { return this.snapshot }, async mutate() { assert.fail('must not write empty catalog') } }
    const remote = { credentials: { async describe() { return { ok: true, value: {} } } } }
    definition.factory(mockRequire(React)).apply({ remote, configForms: { get(ns) { return ns === 'llm-pi-ai' ? scope : selectionScope }, whileServed(_ns, fn) { return fn() } }, locale: { bind() { return (key) => key }, register() { return () => { } } }, slots: { inject(_name, fn) { return fn() }, register(_options, view) { component = view; return () => { } } }, effect(fn) { return fn() } })
    const render = () => { cursor = 0; return component({ scope, selectionScope, remote, t: (key) => key, useScope: () => scope.snapshot, useSelectionScope: () => selectionScope.snapshot }) }
    const find = (node, predicate) => Array.isArray(node) ? node.flatMap((child) => find(child, predicate)) : !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...find(node.children, predicate)]
    const text = (node) => Array.isArray(node) ? node.map(text).join(' ') : node && typeof node === 'object' ? text(node.children) : String(node ?? '')
    const button = (tree, label) => find(tree, (node) => node.type === 'button' && text(node) === label)[0]
    let tree = render()
    await button(tree, 'loadModels').props.onClick()
    tree = render()
    assert.deepEqual(find(tree, (node) => node.type === 'checkbox').map((node) => node.props.checked), [true, false])
    assert.match(text(tree), /10,000.*sourceDefault/)
    assert.match(text(tree), /deep thought/)
    assert.match(text(tree), /defaultEffort.*ultra/)
    assert.match(text(tree), /unknown field/)
    assert.ok(text(tree).includes(malicious))
    assert.equal(find(tree, (node) => node.type === 'img' || node.props?.dangerouslySetInnerHTML).length, 0)
    assert.ok(find(tree, (node) => node.type === 'details').length >= 3)
    assert.equal(find(tree, (node) => node.type === 'button' && node.props.variant === 'primary').length, 1)
    find(tree, (node) => node.type === 'input' && node.props.type === 'search')[0].props.onChange({ currentTarget: { value: 'alpha' } })
    tree = render()
    assert.equal(find(tree, (node) => node.type === 'checkbox').length, 1)
    button(tree, 'deselectAll').props.onClick()
    tree = render()
    assert.match(text(tree), /0\s+selectedCount\s+2/)
    await find(tree, (node) => node.type === 'form')[0].props.onSubmit({ preventDefault() { } })
    tree = render()
    assert.match(text(tree), /needOneModel/)
    button(tree, 'selectAll').props.onClick()
    tree = render()
    assert.match(text(tree), /2\s+selectedCount\s+2/)
    find(tree, (node) => node.type === 'input' && node.props.type === 'search')[0].props.onChange({ currentTarget: { value: 'not-found' } })
    tree = render()
    assert.match(text(tree), /noMatches/)
    fail = true
    await button(tree, 'loadModels').props.onClick()
    tree = render()
    assert.match(text(tree), /loadFailed/)
    assert.match(text(tree), /2\s+selectedCount\s+2/)
    assert.deepEqual(selectionScope.snapshot.value.modelSelection, { absent: false, two: false })
    scope.snapshot = { ...scope.snapshot, writable: false }
    tree = render()
    assert.match(text(tree), /readOnly/)
    assert.equal(button(tree, 'selectAll').props.disabled, true)
    scope.snapshot = { ...scope.snapshot, status: 'loading' }
    tree = render()
    assert.match(text(tree), /loading/)
    assert.equal(tree.props['aria-busy'], true)
  } finally { delete globalThis.window }
})
