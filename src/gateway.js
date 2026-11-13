import { createHash } from 'node:crypto'
import { ConnectionError, resolveIdentity, saveConnection, validateEndpoint } from './connection.js'
import { readCatalogCache, writeCatalogCache } from './catalog-store.js'
import { legacyView, prepareLegacy, cutoverLegacy, finishLegacy, rollbackLegacy, discardPrepared } from './migration.js'
import { createGatewayAdapter } from './adapter.js'
import { validatePolicy } from './policy.js'
import { credentialField } from './secrets.js'

const NS = 'llm-cliproxyapi'
const PROVIDER = 'CLIProxyAPI'
const safeObject = (value) => {
  if (Array.isArray(value)) return value.map(safeObject)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, credentialField(key) ? '[redacted]' : safeObject(item)]))
}
const errorView = (code, message) => ({ code, message })
const generationFor = (id, revision) => createHash('sha256').update(id).update('\0').update(String(revision)).digest('hex')
const fields = {
  'preview-models': ['type', 'baseURL', 'apiKey', 'allowEndpointReuse'],
  'refresh-models': ['type', 'connectionGeneration'],
  'save-connection': ['type', 'expectedRevision', 'operationId', 'baseURL', 'authEdit', 'policy', 'selectionChanges'],
  'save-selection': ['type', 'expectedRevision', 'operationId', 'selectionChanges'],
  'set-enabled': ['type', 'expectedRevision', 'operationId', 'enabled'],
  'forget-key': ['type', 'expectedRevision', 'operationId'],
  'import-legacy': ['type', 'expectedRevision', 'operationId', 'expectedLegacyRevision', 'fingerprint'],
  'rollback-legacy': ['type', 'expectedRevision', 'operationId'],
}
const objectWithFields = (input, allowed) => {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !allowed.includes(key))) throw new ConnectionError('INVALID_REQUEST', 'Invalid request fields')
}
const validatePreview = (input, allowed) => {
  objectWithFields(input, allowed)
  if (input.apiKey !== undefined && (typeof input.apiKey !== 'string' || Buffer.byteLength(input.apiKey) > 4096)) throw new ConnectionError('INVALID_AUTH', 'Invalid key')
  if (input.allowEndpointReuse !== undefined && typeof input.allowEndpointReuse !== 'boolean') throw new ConnectionError('INVALID_REQUEST', 'Invalid endpoint reuse')
}

export function installGateway(ctx, config, discover, readJson, previewKey) {
  const diagnostics = []
  let registration
  let controller
  let catalog
  let freshness = 'empty'
  let catalogError
  let activationError
  let loading = false
  let stopped = false
  let wakeDispose
  const activeRefreshes = new Set()
  const abortRefreshes = () => { for (const active of activeRefreshes) active.abort() }
  let failures = 0
  const cancelWake = () => { wakeDispose?.(); wakeDispose = undefined }
  const schedule = (delay, generation) => {
    cancelWake()
    if (stopped || !generation || delay <= 0) return
    wakeDispose = ctx.timeout(() => {
      wakeDispose = undefined
      const value = current()
      if (stopped || value.generation !== generation || value.enabled === false || !value.baseURL || value.authIdentity?.type === 'missing' || ['prepared', 'rollback'].includes(value.migration?.phase)) return
      controller = new AbortController()
      void refresh(generation, controller.signal).catch(() => { })
    }, delay)
  }
  const descriptor = () => {
    const result = ctx.settings.describe().find((row) => row.ns === NS)
    if (!result || !Number.isSafeInteger(result.revision)) throw new ConnectionError('SETTINGS_UNAVAILABLE', 'Connection settings are unavailable')
    return result
  }
  const current = () => descriptor().value ?? {}
  const identityKey = async (identity) => {
    if (identity?.type === 'missing') return undefined
    return resolveIdentity(ctx.credentials, identity)
  }
  const gateway = createGatewayAdapter(ctx, undefined, diagnostics, () => { void activate().catch(() => { }) })
  const compatibleCatalog = (value) => catalog && catalog.generation === value.generation && catalog.baseURL === value.baseURL && JSON.stringify(catalog.authIdentity) === JSON.stringify(value.authIdentity)
  const activate = async () => {
    const value = current()
    let ready = !!value.baseURL && value.enabled !== false && !['prepared', 'rollback'].includes(value.migration?.phase) && compatibleCatalog(value)
    if (ready && value.authIdentity?.type !== 'none') {
      try { ready = !!(await identityKey(value.authIdentity)) } catch { ready = false }
    }
    ready = ready && catalog.effective.some((model) => value.modelSelection?.[model.id] !== false)
    if (stopped || current().generation !== value.generation) return
    if (!ready) {
      try { registration?.replace([]) } catch { activationError = errorView('ACTIVATION_FAILED', 'Could not deactivate CPA route') }
      return
    }
    try {
      gateway.update({ ...value, models: catalog.effective })
      if (registration) registration.replace([PROVIDER])
      else registration = ctx.llm.registerAdapter([PROVIDER], gateway.adapter)
      activationError = undefined
    } catch {
      try { registration?.replace([]) } catch { }
      activationError = errorView('ACTIVATION_FAILED', 'Could not activate CPA route; another owner may be using it')
    }
  }
  const view = async () => {
    const { value = {}, revision } = descriptor()
    let keyConfigured = false
    if (value.authIdentity && value.authIdentity.type !== 'none') {
      try { keyConfigured = !!(await identityKey(value.authIdentity)) } catch { keyConfigured = false }
    }
    const authReady = value.authIdentity?.type === 'none' || keyConfigured
    const models = compatibleCatalog(value) ? catalog.effective : []
    const configured = !!value.baseURL
    const status = !configured ? 'not-configured' : value.enabled === false ? 'disabled' : !authReady ? 'missing-credential' : loading ? 'catalog-loading' : activationError ? 'error' : !models.length ? (catalogError ? 'error' : 'catalog-loading') : !models.some((m) => value.modelSelection?.[m.id] !== false) ? 'no-models' : freshness === 'stale' ? 'stale' : 'ready'
    return {
      revision, ...(value.generation ? { generation: value.generation } : {}), ...(value.operationId ? { operationId: value.operationId } : {}),
      configured, enabled: value.enabled !== false, baseURL: value.baseURL ?? null,
      authMode: value.authIdentity?.type === 'missing' ? 'record' : value.authIdentity?.type ?? null,
      keyConfigured, keyWritable: ctx.settings.writable !== false,
      modelSelection: value.modelSelection ?? {}, policy: safeObject(value.policy ?? {}), models,
      status, catalog: { freshness: loading ? 'loading' : freshness, ...(compatibleCatalog(value) ? { fetchedAt: catalog.fetchedAt } : {}), ...(catalogError ? { error: catalogError } : {}) },
      diagnostics: [...diagnostics], ...(activationError ? { activationError } : {}), legacy: legacyView(ctx.settings),
    }
  }
  const load = async () => {
    const value = current()
    if (!value.baseURL || !value.generation) return
    try {
      const saved = await readCatalogCache(ctx.settings.documentPath, value.generation, value.baseURL, value.authIdentity)
      if (saved && current().generation === value.generation) { catalog = saved; freshness = 'stale' }
    } catch { catalogError = errorView('CACHE_UNAVAILABLE', 'Catalog cache could not be read') }
    await activate()
  }
  const refresh = async (generation, signal) => {
    if (stopped) throw new ConnectionError('STALE_GENERATION', 'Connection is no longer active')
    const value = structuredClone(current())
    if (!value.baseURL || generation !== value.generation) throw new ConnectionError('STALE_GENERATION', 'Connection has changed')
    if (value.enabled === false || value.authIdentity?.type === 'missing') throw new ConnectionError('MISSING_CREDENTIAL', 'CPA connection is disabled or missing a credential')
    const active = new AbortController()
    const forwardAbort = () => active.abort(signal.reason)
    if (signal?.aborted) forwardAbort()
    else signal?.addEventListener('abort', forwardAbort, { once: true })
    activeRefreshes.add(active)
    loading = true
    try {
      const key = await identityKey(value.authIdentity)
      if (value.authIdentity?.type !== 'none' && !key) throw new ConnectionError('MISSING_CREDENTIAL', 'CPA credential is missing')
      if (active.signal.aborted) throw active.signal.reason
      const result = await discover(value, active.signal, key)
      if (active.signal.aborted) throw active.signal.reason
      if (current().generation !== generation) throw new ConnectionError('STALE_GENERATION', 'Connection has changed')
      const next = { generation, baseURL: value.baseURL, authIdentity: value.authIdentity, fetchedAt: Date.now(), raw: result.discovery.map((m) => m.catalogMetadata), effective: result.discovery }
      let persistenceError
      try { await writeCatalogCache(ctx.settings.documentPath, next) } catch { persistenceError = errorView('CACHE_UNAVAILABLE', 'Catalog cache could not be saved') }
      if (active.signal.aborted) throw active.signal.reason
      if (current().generation !== generation) throw new ConnectionError('STALE_GENERATION', 'Connection has changed')
      catalog = next
      freshness = 'fresh'
      catalogError = persistenceError
      failures = 0
    } catch (error) {
      if (!stopped && current().generation === generation && !active.signal.aborted) {
        if (compatibleCatalog(value)) freshness = 'stale'
        catalogError = { ...errorView(error?.code ?? 'CATALOG_TRANSPORT', 'Could not refresh the CPA catalog'), ...(Number.isInteger(error?.status) ? { status: error.status } : {}) }
        if (error?.code !== 'MISSING_CREDENTIAL') failures++
      }
      throw error
    } finally {
      activeRefreshes.delete(active)
      signal?.removeEventListener('abort', forwardAbort)
      loading = false
      await activate()
      if (!stopped && current().generation === generation && current().migration?.phase === 'cutover' && registration && !activationError) await finishLegacy(ctx.settings)
      if (!stopped && current().generation === generation && current().enabled !== false && current().authIdentity?.type !== 'missing' && !active.signal.aborted) {
        const cfg = config()
        schedule(failures ? Math.min(cfg.retryInitialMs * 2 ** Math.max(0, failures - 1), cfg.retryMaxMs) : cfg.refreshIntervalMs, generation)
      }
    }
  }
  const mutate = async (input, values) => {
    const before = descriptor()
    if (!Number.isSafeInteger(input.expectedRevision) || typeof input.operationId !== 'string' || !input.operationId || input.operationId.length > 256) throw new ConnectionError('INVALID_REQUEST', 'Revision and operation ID are required')
    if (before.value?.operationId === input.operationId) {
      if (Object.entries(values).some(([key, value]) => JSON.stringify(before.value?.[key]) !== JSON.stringify(value))) throw new ConnectionError('OPERATION_CONFLICT', 'Operation ID belongs to another operation')
      return
    }
    if (before.revision !== input.expectedRevision) throw new ConnectionError('SETTINGS_CONFLICT', 'Connection settings have changed')
    const generation = generationFor(input.operationId, before.revision)
    const ops = Object.entries({ ...values, operationId: input.operationId, generation }).map(([key, value]) => ({ op: 'set', path: [key], value }))
    try { await ctx.settings.mutate(NS, ops, before.revision) } catch (error) {
      if (error?.code === 'SETTINGS_CONFLICT') throw error
      if (descriptor().value?.operationId !== input.operationId) throw new ConnectionError('UNKNOWN', 'Save outcome is unknown; read state before retrying')
    }
    if (descriptor().value?.operationId !== input.operationId) throw new ConnectionError('UNKNOWN', 'Save outcome is unknown; read state before retrying')
    cancelWake(); abortRefreshes()
    if (catalog && catalog.generation === before.value?.generation) {
      catalog = { ...catalog, generation }
      try { await writeCatalogCache(ctx.settings.documentPath, catalog) } catch { freshness = 'stale'; catalogError = errorView('CACHE_UNAVAILABLE', 'Catalog cache could not be saved') }
    }
    await activate()
    const value = current()
    if (value.generation === generation && value.enabled !== false && value.authIdentity?.type !== 'missing') {
      const cfg = config()
      schedule(failures ? Math.min(cfg.retryInitialMs * 2 ** Math.max(0, failures - 1), cfg.retryMaxMs) : cfg.refreshIntervalMs, generation)
    }
  }
  const preview = async (input, signal) => {
    const endpoint = validateEndpoint(input.baseURL)
    const key = await previewKey(endpoint, input.apiKey, input.allowEndpointReuse)
    const result = await discover({ baseURL: endpoint }, signal, key)
    return result.discovery
  }
  const command = async (input, signal) => {
    objectWithFields(input, fields[input?.type] ?? [])
    if (input.type === 'preview-models') { validatePreview(input, fields[input.type]); return preview(input, signal) }
    if (input.type === 'save-connection') {
      const authFields = { keep: ['type', 'allowEndpointReuse'], replace: ['type', 'key'], reference: ['type', 'ref', 'allowEndpointReuse'], none: ['type'] }
      objectWithFields(input.authEdit, authFields[input.authEdit?.type] ?? [])
      if (input.authEdit?.allowEndpointReuse !== undefined && typeof input.authEdit.allowEndpointReuse !== 'boolean') throw new ConnectionError('INVALID_AUTH', 'Invalid endpoint reuse')
      if (input.authEdit?.type === 'replace' && (typeof input.authEdit.key !== 'string' || Buffer.byteLength(input.authEdit.key) > 4096)) throw new ConnectionError('INVALID_AUTH', 'Invalid key')
    }
    if (input.type === 'refresh-models') { await refresh(input.connectionGeneration, signal); return view() }
    if (input.type === 'save-connection') {
      validatePolicy(input.policy === undefined ? current().policy ?? {} : input.policy)
      // A legacy llm-pi-ai provider owns the same route. Adopt it instead of
      // refusing the save: prepareLegacy records a full backup, so the cutover
      // stays reversible through rollback-legacy. The cutover runs only after the
      // save itself succeeded, so a rejected draft leaves the legacy route intact.
      let save = input
      let adopted = false
      if (!current().baseURL) {
        const summary = legacyView(ctx.settings)
        if (summary.available) {
          await prepareLegacy(ctx.settings, { expectedRevision: descriptor().revision, expectedLegacyRevision: summary.revision, fingerprint: summary.fingerprint, operationId: input.operationId + ':adopt' })
          save = { ...input, expectedRevision: descriptor().revision }
          adopted = true
        } else if (ctx.settings.describe().find((row) => row.ns === 'llm-pi-ai')?.value?.providers?.[PROVIDER]) {
          throw new ConnectionError('LEGACY_CONFLICT', summary.reason ?? 'The existing CPA provider must be resolved first')
        }
      }
      const previous = current()
      try {
        await saveConnection(ctx.settings, ctx.credentials, save)
      } catch (error) {
        // The prepared migration already wrote our row. A definite rejection is
        // undone so the legacy route keeps working; an ambiguous outcome is left
        // for rollback-legacy, because discarding could erase a real save.
        if (adopted && error?.code !== 'UNKNOWN') { try { await discardPrepared(ctx.settings) } catch { } }
        throw error
      }
      if (adopted) await cutoverLegacy(ctx.settings)
      const value = current()
      if (previous.generation !== value.generation) { cancelWake(); abortRefreshes(); failures = 0; catalog = undefined; freshness = 'empty'; catalogError = undefined }
      try { await refresh(value.generation, signal) } catch { await activate() }
      return view()
    }
    if (input.type === 'save-selection') {
      if (!input.selectionChanges || typeof input.selectionChanges !== 'object' || Array.isArray(input.selectionChanges) || Object.values(input.selectionChanges).some((x) => typeof x !== 'boolean')) throw new ConnectionError('INVALID_SELECTION', 'Invalid model selection')
      await mutate(input, { modelSelection: { ...(current().modelSelection ?? {}), ...input.selectionChanges } })
      return view()
    }
    if (input.type === 'set-enabled') {
      if (typeof input.enabled !== 'boolean') throw new ConnectionError('INVALID_REQUEST', 'Enabled must be a boolean')
      if (input.enabled === (current().enabled !== false)) {
        if (descriptor().revision !== input.expectedRevision && current().operationId !== input.operationId) throw new ConnectionError('SETTINGS_CONFLICT', 'Connection settings have changed')
      } else await mutate(input, { enabled: input.enabled })
      if (input.enabled) { const value = current(); try { await refresh(value.generation, signal) } catch { } } else { cancelWake(); abortRefreshes() }
      return view()
    }
    if (input.type === 'forget-key') { cancelWake(); abortRefreshes(); await mutate(input, { authIdentity: { type: 'missing' } }); return view() }
    if (input.type === 'import-legacy') {
      await prepareLegacy(ctx.settings, input)
      await cutoverLegacy(ctx.settings)
      const value = current()
      try { await refresh(value.generation, signal) } catch { }
      if (current().migration?.phase !== 'active') activationError ??= errorView('MIGRATION_PENDING', 'Migration is prepared; refresh the catalog to finish activation')
      return view()
    }
    if (input.type === 'rollback-legacy') {
      if (!Number.isSafeInteger(input.expectedRevision) || descriptor().revision !== input.expectedRevision) throw new ConnectionError('SETTINGS_CONFLICT', 'Connection settings have changed')
      if (typeof input.operationId !== 'string' || !input.operationId) throw new ConnectionError('INVALID_OPERATION', 'An operation ID is required')
      cancelWake(); abortRefreshes()
      await rollbackLegacy(ctx.settings, async () => { registration?.replace([]) })
      catalog = undefined
      freshness = 'empty'
      activationError = undefined
      return view()
    }
    throw new ConnectionError('INVALID_REQUEST', 'Unknown command')
  }
  const reply = (status, value) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } })
  ctx.inject(['connection'], (web) => {
    for (const [path, methods] of [['/api/cliproxyapi/state', ['GET']], ['/api/cliproxyapi/command', ['POST']], ['/api/cliproxyapi/catalog', ['POST']]]) {
      web.connection.fetch.register({
        path, methods, requestBody: 'buffered', async fetch(request) {
          try {
            if (path.endsWith('/state')) return reply(200, { ok: true, value: await view() })
            if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') return reply(415, { ok: false, error: { ...errorView('INVALID_REQUEST', 'Expected JSON'), details: {} } })
            let input
            try { input = await readJson(request, 16 * 1024) } catch { throw new ConnectionError('INVALID_REQUEST', 'Invalid or oversized JSON') }
            if (path.endsWith('/catalog')) validatePreview(input, ['baseURL', 'apiKey', 'allowEndpointReuse'])
            const value = path.endsWith('/catalog') ? await preview(input, request.signal) : await command(input, request.signal)
            return reply(200, { ok: true, value })
          } catch (error) {
            const code = error instanceof ConnectionError ? error.code : error?.code === 'SETTINGS_CONFLICT' ? 'SETTINGS_CONFLICT' : 'REQUEST_FAILED'
            const status = code === 'SETTINGS_CONFLICT' || code === 'OPERATION_CONFLICT' || code === 'STALE_GENERATION' || code === 'LEGACY_CONFLICT' ? 409 : code === 'REQUEST_FAILED' || code === 'UNKNOWN' || code.startsWith('CATALOG_') ? 502 : 400
            return reply(status, { ok: false, error: { ...errorView(code, error instanceof ConnectionError ? error.message : 'CPA request failed'), details: Number.isInteger(error?.status) ? { status: error.status } : {} } })
          }
        }
      })
    }
  })
  ctx.on('credentials/reference-updated', () => { void activate().catch(() => { }) })
  ctx.on('credentials/record-updated', () => { void activate().catch(() => { }) })
  ctx.on('settings/document-updated', (ns) => { if (ns === NS) { const value = current(); if (value.enabled === false || value.authIdentity?.type === 'missing') { cancelWake(); abortRefreshes() } void activate().catch(() => { }) } })
  ctx.effect(() => () => { stopped = true; cancelWake(); abortRefreshes(); registration?.() })
  void (async () => {
    // A prepared migration means the process stopped between writing our row and
    // removing the legacy provider. Completing the cutover is the only forward
    // path; leaving it prepared would keep the route deactivated forever.
    if (current().migration?.phase === 'prepared') { try { await cutoverLegacy(ctx.settings) } catch { } }
    if (current().migration?.phase === 'cutover') await cutoverLegacy(ctx.settings)
    if (current().migration?.phase === 'rollback') await rollbackLegacy(ctx.settings, async () => { registration?.replace([]) })
    await load()
    const value = current()
    if (!stopped && value.baseURL && value.generation && value.enabled !== false && value.authIdentity?.type !== 'missing' && !['prepared', 'rollback'].includes(value.migration?.phase)) { controller = new AbortController(); try { await refresh(value.generation, controller.signal) } catch { } }
  })().catch(() => { activationError = errorView('MIGRATION_PENDING', 'Connection recovery needs attention') })
}
