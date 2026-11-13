import { AsyncResource } from 'node:async_hooks'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { assertUsableApiKey, attributionHeaders } from '@deepseek-ai/dsh-llm'
import { Config as PiAiConfig } from '@deepseek-ai/dsh-llm-pi-ai'
import { deepEqualJson } from '@deepseek-ai/dsh-util-values'
import { catalogURL, readCodexCatalogWithMetadata } from './catalog.js'
import { installGateway } from './gateway.js'
import { protocolOf } from './policy.js'
import { ConnectionError, resolveIdentity, validateEndpoint } from './connection.js'

const MAX_CATALOG_BYTES = 4 * 1024 * 1024
const DISCOVERY_HANDOFF_TTL_MS = 60_000
const MAX_DISCOVERY_HANDOFFS = 8
const DISCOVERY_NS = 'llm-cliproxyapi'
const PI_NS = 'llm-pi-ai'
const API_KEY_REF = credentialRef('DSH_CLIPROXY_API_KEY')
const PROVIDER = 'CLIProxyAPI'

export const PROFILE_SYNC_HEADER = 'x-dsh-provider-cpa-sync'
export const PLACEHOLDER_AUTHORIZATION = 'Bearer dsh-cliproxyapi-no-key'
export const CATALOG_PATH = '/api/cliproxyapi/catalog'

export const name = DISCOVERY_NS
export const inject = ['settings', 'credentials', 'llm', 'timer']

export const Config = z.object({
  defaultContextWindow: z.number().step(1).min(1).default(262144),
  defaultMaxTokens: z.number().step(1).min(1).default(32768),
  defaultInput: z.array(z.union(['text', 'image'])).default(['text']),
  headers: z.dict(z.string()).default({}),
  fetchTimeoutMs: z.number().step(1).min(1).default(15000),
  retryInitialMs: z.number().step(1).min(1).default(3000),
  retryMaxMs: z.number().step(1).min(1).default(60000),
  modelSelection: z.dict(z.boolean()).default({}).volatile(),
  refreshIntervalMs: z.number().step(1).min(0).default(300000),
  baseURL: z.string().volatile(),
  enabled: z.boolean().default(true).volatile(),
  authIdentity: z.any().volatile(),
  policy: z.any().volatile(),
  generation: z.string().volatile(),
  operationId: z.string().volatile(),
  overrides: z.any().volatile(),
  migration: z.any().volatile(),
})

function normalizedBaseURL(value) {
  const baseURL = String(value ?? '').trim().replace(/\/+$/, '')
  if (!baseURL) throw new TypeError('CLIProxyAPI baseURL must not be empty')
  let parsed
  try {
    parsed = new URL(baseURL)
  } catch (error) {
    throw new TypeError('CLIProxyAPI baseURL must be a valid URL', { cause: error })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TypeError('CLIProxyAPI baseURL must use http or https')
  }
  return baseURL
}

function headerKey(headers, expected) {
  const normalized = expected.toLowerCase()
  return Object.keys(headers ?? {}).find((key) => key.toLowerCase() === normalized)
}

function profileSyncValue(profile) {
  const key = headerKey(profile?.headers, PROFILE_SYNC_HEADER)
  return key === undefined ? undefined : String(profile.headers[key])
}

function profileSynchronizationPending(profile) {
  return profileSyncValue(profile) !== undefined
}

function profileHasRichBootstrap(profile) {
  return profileSyncValue(profile)?.startsWith('rich:') ?? false
}

function mergedHeadersOf(profileHeaders, configuredHeaders) {
  const headers = {}
  for (const source of [configuredHeaders, profileHeaders]) {
    for (const [key, value] of Object.entries(source ?? {})) {
      const existing = headerKey(headers, key)
      if (existing !== undefined) delete headers[existing]
      if (key.toLowerCase() !== PROFILE_SYNC_HEADER) headers[key] = value
    }
  }
  return headers
}

function catalogHeadersOf(profileHeaders, configuredHeaders) {
  const headers = mergedHeadersOf(profileHeaders, configuredHeaders)
  const authorization = headerKey(headers, 'authorization')
  if (authorization !== undefined && headers[authorization] === PLACEHOLDER_AUTHORIZATION) {
    delete headers[authorization]
  }
  return headers
}

function profileHeadersOf(profileHeaders, configuredHeaders, hasApiKey) {
  const headers = mergedHeadersOf(profileHeaders, configuredHeaders)
  const authorization = headerKey(headers, 'authorization')
  if (hasApiKey) {
    if (authorization !== undefined && headers[authorization] === PLACEHOLDER_AUTHORIZATION) {
      delete headers[authorization]
    }
  } else if (authorization === undefined) {
    headers.authorization = PLACEHOLDER_AUTHORIZATION
  }
  return headers
}

async function optionalApiKey(ctx, supplied) {
  const raw = supplied === undefined
    ? (await ctx.credentials.resolve(API_KEY_REF))?.value
    : supplied
  if (raw === undefined || raw.length === 0) return undefined
  return assertUsableApiKey(raw, DISCOVERY_NS, API_KEY_REF)
}

function timedSignal(parent, timeoutMs) {
  const controller = new AbortController()
  const timeoutError = new Error(`CLIProxyAPI model catalog timed out after ${timeoutMs} ms`)
  timeoutError.name = 'TimeoutError'
  const forwardAbort = () => controller.abort(parent.reason)
  if (parent?.aborted) forwardAbort()
  else parent?.addEventListener('abort', forwardAbort, { once: true })
  const timer = setTimeout(() => controller.abort(timeoutError), timeoutMs)
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer)
      parent?.removeEventListener('abort', forwardAbort)
    },
  }
}

async function readBoundedJson(response, maxBytes = MAX_CATALOG_BYTES) {
  const declared = Number(response.headers.get('content-length') ?? Number.NaN)
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel()
    throw new ConnectionError('CATALOG_TOO_LARGE', 'CPA catalog is too large')
  }
  if (!response.body) return JSON.parse(await response.text())
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  try {
    for (; ;) {
      const part = await reader.read()
      if (part.done) break
      total += part.value.byteLength
      if (total > maxBytes) throw new ConnectionError('CATALOG_TOO_LARGE', 'CPA catalog is too large')
      chunks.push(part.value)
    }
  } finally {
    await reader.cancel().catch(() => { })
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder().decode(bytes))
}

async function discoverCatalog(ctx, options, suppliedApiKey, parentSignal) {
  const apiKey = await optionalApiKey(ctx, suppliedApiKey)
  const baseURL = normalizedBaseURL(options.baseURL)
  const url = catalogURL(baseURL)
  const request = timedSignal(parentSignal, options.fetchTimeoutMs)
  try {
    let response
    try {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'error',
        signal: request.signal,
        headers: {
          accept: 'application/json',
          ...options.headers,
          ...(apiKey ? { authorization: 'Bearer ' + apiKey } : {}),
          ...attributionHeaders(),
        },
      })
    } catch (error) {
      if (parentSignal?.aborted) throw parentSignal.reason ?? error
      if (request.signal.aborted) throw new ConnectionError('CATALOG_TIMEOUT', `CLIProxyAPI model catalog timed out after ${options.fetchTimeoutMs} ms`)
      throw new ConnectionError('CATALOG_TRANSPORT', 'Could not reach CPA catalog')
    }
    if (!response.ok) {
      const failure = new ConnectionError(response.status === 401 || response.status === 403 ? 'CATALOG_AUTH' : 'CATALOG_TRANSPORT', 'CPA catalog request failed')
      failure.status = response.status
      throw failure
    }
    let body
    try {
      body = await readBoundedJson(response)
    } catch (error) {
      if (parentSignal?.aborted) throw parentSignal.reason ?? error
      if (request.signal.aborted) throw new ConnectionError('CATALOG_TIMEOUT', `CLIProxyAPI model catalog timed out after ${options.fetchTimeoutMs} ms`)
      if (error?.code === 'CATALOG_TOO_LARGE') throw error
      throw new ConnectionError('CATALOG_INVALID_RESPONSE', 'CPA catalog returned invalid JSON')
    }
    try {
      return {
        ...readCodexCatalogWithMetadata(body, options),
        hasApiKey: apiKey !== undefined,
      }
    } catch (error) {
      throw new ConnectionError('CATALOG_INVALID_RESPONSE', 'CPA catalog response is invalid')
    }
  } finally {
    request.dispose()
  }
}

function sortedHeaders(headers) {
  return Object.fromEntries(Object.entries(headers).sort(([left], [right]) => {
    return left.toLowerCase().localeCompare(right.toLowerCase())
  }))
}

function refreshKeyOf(profile, config) {
  if (!profile) return undefined
  return JSON.stringify({
    displayName: profile.displayName,
    api: profile.api,
    baseURL: String(profile.baseURL ?? '').trim().replace(/\/+$/, ''),
    models: profile.models,
    defaultContextWindow: profile.defaultContextWindow,
    defaultMaxTokens: profile.defaultMaxTokens,
    defaultInput: profile.defaultInput,
    sync: profileSyncValue(profile),
    supportsStrictMode: profile.compat?.supportsStrictMode,
    headers: sortedHeaders(catalogHeadersOf(profile.headers, config.headers)),
  })
}

async function profileOf(profile, models, hasApiKey, config) {
  const {
    apiKeyEnv: _previousApiKeyEnv,
    modelOverrides: _previousModelOverrides,
    ...rest
  } = profile
  const candidate = {
    ...rest,
    displayName: PROVIDER,
    api: protocolOf(profile),
    baseURL: normalizedBaseURL(profile.baseURL),
    // This enables pi-ai's explicit strict:false, avoiding upstream auto-strict.
    compat: { ...profile.compat, supportsStrictMode: true },
    models,
    defaultContextWindow: profile.defaultContextWindow ?? config.defaultContextWindow,
    defaultMaxTokens: profile.defaultMaxTokens ?? config.defaultMaxTokens,
    defaultInput: [...(profile.defaultInput ?? config.defaultInput)],
    headers: profileHeadersOf(profile.headers, config.headers, hasApiKey),
    ...(hasApiKey ? { apiKeyEnv: API_KEY_REF } : {}),
  }
  // providers is volatile in DSH 0.2: the Standard Schema view omits it.
  // The callable schema validates the entry and keeps its resolved value.
  return PiAiConfig({ providers: { [PROVIDER]: candidate } }).providers.get()[PROVIDER]
}

function retryDelay(config, failures) {
  return Math.min(config.retryInitialMs * (2 ** Math.max(0, failures - 1)), config.retryMaxMs)
}

export function apply(ctx, config) {
  const validateConfig = (value) => {
    if (!value.defaultInput.length) throw new Error('defaultInput must contain at least one modality')
    if (value.retryMaxMs < value.retryInitialMs) {
      throw new Error('retryMaxMs must be greater than or equal to retryInitialMs')
    }
  }
  validateConfig(config)
  const syncContext = new AsyncResource('dsh-cliproxyapi-sync')
  let source = () => config
  const currentConfig = () => source()

  const catalogFor = (profile, signal, activeConfig) => discoverCatalog(ctx, {
    baseURL: profile.baseURL,
    defaultContextWindow: activeConfig.defaultContextWindow,
    defaultMaxTokens: activeConfig.defaultMaxTokens,
    defaultInput: activeConfig.defaultInput,
    headers: catalogHeadersOf(profile.headers, activeConfig.headers),
    fetchTimeoutMs: activeConfig.fetchTimeoutMs,
  }, undefined, signal)

  // DSH 0.2 stores pi-ai providers in the loader entry's volatile form,
  // exposed by settings.describe(), rather than a settings.get() section.
  const currentProfile = () => ctx.settings.describe()
    .find((entry) => entry.ns === PI_NS)?.value?.providers?.[PROVIDER]

  const currentSelection = (settings) => settings
    .find((entry) => entry.ns === DISCOVERY_NS)?.value?.modelSelection ?? config.modelSelection?.get?.() ?? {}

  const discoveryHandoffs = new Map()

  const rememberDiscovery = (baseURL, models) => {
    const now = Date.now()
    for (const [key, handoff] of discoveryHandoffs) {
      if (now - handoff.storedAt > DISCOVERY_HANDOFF_TTL_MS) discoveryHandoffs.delete(key)
    }
    while (discoveryHandoffs.size >= MAX_DISCOVERY_HANDOFFS) {
      discoveryHandoffs.delete(discoveryHandoffs.keys().next().value)
    }
    discoveryHandoffs.set(normalizedBaseURL(baseURL), {
      models: structuredClone(models),
      storedAt: now,
    })
  }

  const takeDiscovery = (baseURL) => {
    const key = normalizedBaseURL(baseURL)
    const handoff = discoveryHandoffs.get(key)
    discoveryHandoffs.delete(key)
    if (!handoff || Date.now() - handoff.storedAt > DISCOVERY_HANDOFF_TTL_MS) return undefined
    return handoff.models
  }
  const previewKey = async (endpoint, supplied, allowEndpointReuse) => {
    validateEndpoint(endpoint)
    if (supplied !== undefined) {
      if (typeof supplied !== 'string' || Buffer.byteLength(supplied) > 4096) throw new ConnectionError('INVALID_AUTH', 'Invalid key')
      return supplied
    }
    if (allowEndpointReuse !== undefined && typeof allowEndpointReuse !== 'boolean') throw new ConnectionError('INVALID_REQUEST', 'Invalid endpoint reuse')
    const settings = ctx.settings.describe()
    const own = settings.find((entry) => entry.ns === DISCOVERY_NS)?.value
    if (own?.baseURL && own.authIdentity) {
      if (own.baseURL !== endpoint && allowEndpointReuse !== true) return ''
      if (own.authIdentity.type === 'missing') throw new ConnectionError('MISSING_CREDENTIAL', 'CPA credential is missing')
      const key = await resolveIdentity(ctx.credentials, own.authIdentity)
      if (own.authIdentity.type !== 'none' && !key) throw new ConnectionError('MISSING_CREDENTIAL', 'CPA credential is missing')
      return key ?? ''
    }
    const legacy = settings.find((entry) => entry.ns === PI_NS)?.value?.providers?.[PROVIDER]
    if (legacy?.baseURL === endpoint) return (await optionalApiKey(ctx)) ?? ''
    return ''
  }


  const discoverModels = async (request, signal) => {
    const activeConfig = currentConfig()
    const catalog = await discoverCatalog(ctx, {
      baseURL: request.baseURL,
      defaultContextWindow: activeConfig.defaultContextWindow,
      defaultMaxTokens: activeConfig.defaultMaxTokens,
      defaultInput: activeConfig.defaultInput,
      headers: {},
      fetchTimeoutMs: activeConfig.fetchTimeoutMs,
    }, await previewKey(request.baseURL, request.apiKey, request.allowEndpointReuse), signal ?? request.signal)
    rememberDiscovery(request.baseURL, catalog.models)
    return catalog.discovery
  }
  ctx.llm.registerModelDiscovery(DISCOVERY_NS, discoverModels)
  installGateway(ctx, currentConfig, async (request, signal, key) => discoverCatalog(ctx, {
    baseURL: request.baseURL,
    defaultContextWindow: request.policy?.defaultContextWindow ?? currentConfig().defaultContextWindow,
    defaultMaxTokens: request.policy?.defaultMaxTokens ?? currentConfig().defaultMaxTokens,
    defaultInput: request.policy?.defaultInput ?? currentConfig().defaultInput,
    overrides: request.overrides,
    headers: request.policy?.headers ?? {},
    fetchTimeoutMs: currentConfig().fetchTimeoutMs,
  }, key ?? '', signal), readBoundedJson, previewKey)


  let observedRefreshKey

  const synchronize = async (signal, authOnly = false) => {
    const activeConfig = currentConfig()
    const settings = ctx.settings.describe()
    const own = settings.find((entry) => entry.ns === DISCOVERY_NS)?.value
    if (own?.baseURL && own.migration?.phase !== 'prepared') return false
    const descriptor = settings.find((entry) => entry.ns === PI_NS)
    const profile = descriptor?.value?.providers?.[PROVIDER]
    if (!profile) return false
    if (!Number.isSafeInteger(descriptor.revision)) throw new Error('CLIProxyAPI cannot synchronize without a settings revision')
    if (authOnly && profileSynchronizationPending(profile)) return true
    if (signal.aborted) throw signal.reason
    const hasApiKey = async () => (await optionalApiKey(ctx)) !== undefined
    let catalog
    if (authOnly) {
      catalog = { models: profile.models, hasApiKey: await hasApiKey() }
    } else if (profileHasRichBootstrap(profile)) {
      const discovered = takeDiscovery(profile.baseURL)
      catalog = discovered
        ? { models: discovered, hasApiKey: await hasApiKey() }
        : await catalogFor(profile, signal, activeConfig)
    } else {
      catalog = await catalogFor(profile, signal, activeConfig)
    }
    if (signal.aborted) throw signal.reason
    const selection = authOnly ? undefined : currentSelection(settings)
    const enabledModels = authOnly ? catalog.models : catalog.models.filter((model) => selection[model.id] !== false)
    if (!enabledModels.length) throw new Error('CLIProxyAPI has no enabled models in the current catalog; the existing profile was not changed')
    const next = await profileOf(profile, enabledModels, catalog.hasApiKey, activeConfig)
    if (signal.aborted) throw signal.reason
    const nextRefreshKey = refreshKeyOf(next, activeConfig)
    if (!deepEqualJson(next, profile)) {
      const previousRefreshKey = observedRefreshKey
      observedRefreshKey = nextRefreshKey
      try {
        await ctx.settings.mutate(PI_NS, [{
          op: 'set',
          path: ['providers', PROVIDER],
          value: next,
        }], descriptor.revision)
      } catch (error) {
        if (observedRefreshKey === nextRefreshKey) observedRefreshKey = previousRefreshKey
        throw error
      }
    } else {
      observedRefreshKey = nextRefreshKey
    }
    return true
  }

  let stopped = false
  let running = false
  let rerun = false
  let authOnlyRequested = false
  let activeController
  let wakeDispose
  let failures = 0
  let lastError = ''

  const cancelWake = () => {
    wakeDispose?.()
    wakeDispose = undefined
  }

  const wakeAfter = (delay) => {
    cancelWake()
    if (delay <= 0) return
    wakeDispose = ctx.timeout(() => {
      wakeDispose = undefined
      rerun = true
      void drain()
    }, delay)
  }

  const drain = async () => {
    if (running || stopped) return
    running = true
    try {
      while (rerun && !stopped) {
        rerun = false
        const authOnly = authOnlyRequested
        authOnlyRequested = false
        const controller = new AbortController()
        activeController = controller
        try {
          const hasProfile = await synchronize(controller.signal, authOnly)
          failures = 0
          lastError = ''
          if (authOnly) rerun = true
          else if (hasProfile && !rerun) wakeAfter(currentConfig().refreshIntervalMs)
        } catch (error) {
          if (controller.signal.aborted || stopped) continue
          failures += 1
          const message = error instanceof Error ? error.message : String(error)
          if (message !== lastError) {
            ctx.logger.warn('CLIProxyAPI provider refresh failed: ' + message)
            lastError = message
          }
          wakeAfter(retryDelay(currentConfig(), failures))
          break
        } finally {
          if (activeController === controller) activeController = undefined
        }
      }
    } finally {
      running = false
      if (rerun && !wakeDispose && !stopped) void drain()
    }
  }

  const schedule = ({ authOnly = false } = {}) => {
    if (stopped) return
    if (authOnly) authOnlyRequested = true
    cancelWake()
    rerun = true
    activeController?.abort(new Error('CLIProxyAPI provider refresh superseded'))
    if (!running) syncContext.runInAsyncScope(() => void drain())
  }

  const scheduleFromSettings = (force = false) => {
    const profile = currentProfile()
    const refreshKey = refreshKeyOf(profile, currentConfig())
    if (!force && refreshKey === observedRefreshKey) return
    observedRefreshKey = refreshKey
    schedule()
  }

  ctx.on('settings/document-updated', (ns) => {
    if (ns === PI_NS) scheduleFromSettings()
    else if (ns === DISCOVERY_NS) schedule()
  })
  ctx.on('credentials/reference-updated', (ref) => {
    if (ref === API_KEY_REF) schedule({ authOnly: true })
  })
  ctx.effect(() => () => {
    stopped = true
    cancelWake()
    activeController?.abort(new Error('CLIProxyAPI provider plugin disposed'))
    syncContext.emitDestroy()
  })

  scheduleFromSettings(true)
}
