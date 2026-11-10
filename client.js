window.__ModuleLoader__.load({
  id: '@router-for-me/dsh-cliproxyapi-provider',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { Button, Input, Checkbox, Tag } = require('@deepseek-ai/dsh-client-ui-primitives')
    const { useEffect, useState } = React

    const PI_NS = 'llm-pi-ai'
    // The built-in pi-ai discovery cannot parse CLIProxyAPI's Codex models array.
    // Use our own catalog discovery; the server synchronizes its rich capabilities
    // (including reasoningEfforts) after the browser saves the bootstrap profile.
    const DISCOVERY_NS = 'llm-cliproxyapi'
    const CREDENTIAL_REF = 'DSH_CLIPROXY_API_KEY'
    const PROVIDER = 'CLIProxyAPI'
    const DEFAULT_BASE_URL = 'http://127.0.0.1:8317/v1'
    const PROFILE_SYNC_HEADER = 'x-dsh-provider-cpa-sync'
    const PROFILE_SYNC_TIMEOUT_MS = 30000
    const PLACEHOLDER_AUTHORIZATION = 'Bearer dsh-cliproxyapi-no-key'
    const SETTINGS_SLOT = 'plugins.item'
    const SETTINGS_TAB_ID = 'cliproxyapi'
    const SETTINGS_LOCALE_NS = 'settings.cliProxyApi'
    const SETTINGS_SUMMARY_NS = 'llm-cliproxyapi'
    const inject = ['slots', 'locale', 'remote', 'remote.credentials', 'configForms']

    const copy = {
      en: {
        tab: 'CLIProxyAPI',
        title: 'CLIProxyAPI',
        intro: 'Connect a CLIProxyAPI server and import its model catalog.',
        imageCapability: 'Image input is enabled automatically for models that advertise image support.',
        loading: 'Loading CLIProxyAPI settings…',
        unavailable: 'CLIProxyAPI settings are unavailable in this Web profile.',
        readOnly: 'Settings are read-only for this connection.',
        baseURL: 'Base URL',
        apiKey: 'API key',
        apiKeyPlaceholder: 'Optional for a keyless CLIProxyAPI server',
        apiKeyConfiguredPlaceholder: 'API key already saved',
        credentialConfiguredLabel: 'Configured',
        save: 'Save & Enable',
        saving: 'Saving…',
        saved: 'Saved. The CLIProxyAPI model catalog is synchronized.',
        syncTimeout: 'The profile was saved, but its image and reasoning capabilities have not synchronized. Check the provider refresh logs and try again.',
        saveFailed: 'Could not save the CLIProxyAPI profile. Reload settings and try again.',
        baseRequired: 'Base URL is required.',
        baseInvalid: 'Base URL must be a valid HTTP or HTTPS URL.',
        noModels: 'CLIProxyAPI returned no usable models.',
        models: 'Available models',
        loadModels: 'Load models',
        loadingModels: 'Loading models…',
        modelsHelp: 'Disabled models are removed from DSH and requests from existing DSH sessions may fail. Direct CPA API calls are not blocked. New models are enabled by default.',
        loadFailed: 'Could not load the model catalog. Check the URL and API key and try again.',
        metadataHelp: 'Context, output limits and input types are effective settings; values may use configured defaults when the server does not provide them.',
        noEnabledRefresh: 'No current catalog models are enabled. The previous provider list remains active until you enable a model and save.',
        needOneModel: 'Enable at least one available model. DSH cannot save an empty provider catalog.',
        selectionUnavailable: 'Model selection settings are unavailable or read-only.',
        partialSave: 'Saving did not finish. The model selection, API key or profile may already have changed; reload settings and retry.',
        search: 'Search models by name or ID', selectedCount: 'selected of', selectAll: 'Select all loaded models', deselectAll: 'Deselect all loaded models',
        noMatches: 'No models match your search.', enabled: 'Enable', details: 'Model details', rawDetails: 'All CPA fields',
        context: 'Context window', output: 'Maximum output', modalities: 'Input modalities', sourceDefault: 'default', sourceCPA: 'CPA',
        efforts: 'Reasoning efforts', defaultEffort: 'Default effort', description: 'Description', empty: 'Empty', effortUnknown: 'Reasoning efforts not reported',
      },
      zh: {
        tab: 'CLIProxyAPI',
        title: 'CLIProxyAPI',
        intro: '连接 CLIProxyAPI 服务并导入其模型目录。',
        imageCapability: '会根据模型目录中的图片能力声明自动启用图片输入。',
        loading: '正在读取 CLIProxyAPI 设置…',
        unavailable: '当前 Web 配置中无法访问 CLIProxyAPI 设置。',
        readOnly: '当前连接的设置为只读。',
        baseURL: 'Base URL',
        apiKey: 'API Key',
        apiKeyPlaceholder: '无鉴权的 CLIProxyAPI 可留空',
        apiKeyConfiguredPlaceholder: '已保存 API Key',
        credentialConfiguredLabel: '已配置',
        save: '保存并启用',
        saving: '保存中…',
        saved: '已保存，CLIProxyAPI 模型目录已同步。',
        syncTimeout: '配置已保存，但图片与思考能力尚未同步。请检查供应商刷新日志后重试。',
        saveFailed: '无法保存 CLIProxyAPI 配置。请重新加载设置后重试。',
        baseRequired: '请填写 Base URL。',
        baseInvalid: 'Base URL 必须是有效的 HTTP 或 HTTPS 地址。',
        noModels: 'CLIProxyAPI 未返回可用模型。',
        models: '可用模型',
        loadModels: '加载模型',
        loadingModels: '正在加载模型…',
        modelsHelp: '禁用的模型会从 DSH 中移除，已有 DSH 会话的请求也可能失败。直接调用 CPA API 不受影响。新模型默认启用。',
        loadFailed: '无法加载模型目录。请检查 URL 和 API Key 后重试。',
        metadataHelp: '上下文、输出上限和输入类型为实际配置；服务未提供时可能使用默认值。',
        noEnabledRefresh: '当前目录没有已启用的模型。启用模型并保存前，原供应商列表仍然生效。',
        needOneModel: '请至少启用一个可用模型。DSH 不支持保存空的供应商模型目录。',
        selectionUnavailable: '模型选择设置不可用或为只读。',
        partialSave: '保存未完成。模型选择、API Key 或配置可能已经更改；请重新加载设置后重试。',
        search: '按名称或 ID 搜索模型', selectedCount: '已选 / 总数', selectAll: '全选已加载模型', deselectAll: '取消选择所有已加载模型',
        noMatches: '没有匹配的模型。', enabled: '启用', details: '模型详情', rawDetails: '所有 CPA 字段',
        context: '上下文窗口', output: '最大输出', modalities: '输入类型', sourceDefault: '默认值', sourceCPA: 'CPA',
        efforts: '推理等级', defaultEffort: '默认等级', description: '描述', empty: '空', effortUnknown: '未提供推理等级',
      },
    }

    const styles = {
      section: { boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', minWidth: 0, maxWidth: '720px', padding: '24px 16px 40px', margin: '0 auto', color: 'var(--dsw-alias-label-primary)' },
      heading: { display: 'flex', flexDirection: 'column', gap: '6px' },
      title: { margin: 0, fontSize: '16px', fontWeight: 600 },
      intro: { margin: 0, color: 'var(--dsw-alias-label-secondary)', fontSize: '13px', lineHeight: 1.5 },
      form: { display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 },
      field: { display: 'flex', flexDirection: 'column', gap: '7px', minWidth: 0 },
      label: { fontSize: '14px', fontWeight: 500 },
      labelRow: { display: 'flex', alignItems: 'center', gap: '8px' },
      credentialStatus: { color: 'var(--dsw-alias-label-secondary)', fontSize: '12px', fontWeight: 400 },
      status: { margin: 0, color: 'var(--dsw-alias-label-secondary)', fontSize: '13px', lineHeight: 1.5, overflowWrap: 'anywhere' },
      statusError: { margin: 0, color: 'var(--dsw-alias-state-error-primary)', fontSize: '13px', lineHeight: 1.5, overflowWrap: 'anywhere' },
      actions: { display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '8px', paddingTop: '4px' },
      toolbar: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' },
      modelList: { display: 'flex', flexDirection: 'column', minWidth: 0, maxHeight: 'min(560px, 65vh)', overflowY: 'auto', scrollbarGutter: 'stable', border: '0.5px solid var(--dsw-alias-border-l4)', borderRadius: '12px', padding: '0 12px' },
      model: { display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0, padding: '12px 0', borderBottom: '0.5px solid var(--dsw-alias-border-l4)' },
      modelHeader: { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 12px', minWidth: 0 },
      modelName: { minWidth: 0, fontSize: '14px', fontWeight: 600, overflowWrap: 'anywhere' },
      details: { minWidth: 0, fontSize: '13px', lineHeight: 1.5, overflowWrap: 'anywhere' },
      summary: { cursor: 'pointer', color: 'var(--dsw-alias-label-secondary)' },
      metadata: { margin: '6px 0 0', paddingLeft: '16px', minWidth: 0, overflowWrap: 'anywhere' },
      value: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
      efforts: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', minWidth: 0 },
    }

    function validBaseURL(value, messages) {
      if (!value) throw new Error(messages.baseRequired)
      let parsed
      try {
        parsed = new URL(value)
      } catch {
        throw new Error(messages.baseInvalid)
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error(messages.baseInvalid)
    }

    function createSyncToken() {
      return globalThis.crypto?.randomUUID?.()
        || String(Date.now()) + '-' + Math.random().toString(36).slice(2)
    }

    function bootstrapProfileOf(baseURL, models, hasCredential, syncToken, previous = {}) {
      const headers = { ...previous.headers }
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === PROFILE_SYNC_HEADER || (key.toLowerCase() === 'authorization' && headers[key] === PLACEHOLDER_AUTHORIZATION)) delete headers[key]
      }
      headers[PROFILE_SYNC_HEADER] = 'rich:' + syncToken
      if (!hasCredential && !Object.keys(headers).some((key) => key.toLowerCase() === 'authorization')) headers.authorization = PLACEHOLDER_AUTHORIZATION
      const { apiKeyEnv: _previousApiKeyEnv, modelOverrides: _previousModelOverrides, ...rest } = previous
      return {
        ...rest,
        displayName: PROVIDER,
        api: 'openai-responses',
        baseURL,
        compat: { ...previous.compat, supportsStrictMode: true },
        models: models.map((model) => ({
          id: model.id,
          name: model.name || model.id,
          contextWindow: model.contextWindow || 262144,
          maxTokens: model.maxTokens || 32768,
          input: Array.isArray(model.inputModalities) && model.inputModalities.length
            ? [...model.inputModalities]
            : ['text'],
          ...(model.reasoningEfforts ? { reasoningEfforts: { ...model.reasoningEfforts } } : {}),
        })),
        defaultContextWindow: previous.defaultContextWindow ?? 262144,
        defaultMaxTokens: previous.defaultMaxTokens ?? 32768,
        defaultInput: previous.defaultInput ?? ['text'],
        headers,
        ...(hasCredential ? { apiKeyEnv: CREDENTIAL_REF } : {}),
      }
    }

    function comparableProfile(profile, credentialChanged) {
      if (!profile) return profile
      const { models: _models, ...rest } = profile
      const headers = { ...rest.headers }
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === PROFILE_SYNC_HEADER || (credentialChanged && key.toLowerCase() === 'authorization' && headers[key] === PLACEHOLDER_AUTHORIZATION)) delete headers[key]
      }
      if (credentialChanged) delete rest.apiKeyEnv
      return { ...rest, headers }
    }

    function stableJson(value) {
      if (Array.isArray(value)) return value.map(stableJson)
      if (!value || typeof value !== 'object') return value
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJson(value[key])]))
    }

    function sameProfile(left, right, credentialChanged) {
      if (credentialChanged && left?.apiKeyEnv !== right?.apiKeyEnv && left?.apiKeyEnv !== CREDENTIAL_REF) return false
      return JSON.stringify(stableJson(comparableProfile(left, credentialChanged))) === JSON.stringify(stableJson(comparableProfile(right, credentialChanged)))
    }

    function syncValueOf(headers) {
      const key = Object.keys(headers || {}).find((candidate) => candidate.toLowerCase() === PROFILE_SYNC_HEADER)
      return key === undefined ? undefined : String(headers[key])
    }

    function waitForProfileSynchronization(scope, baseURL, previousRevision, enabled, hasCredential, messages) {
      return new Promise((resolve, reject) => {
        let finished = false
        let dispose = () => { }
        let timeout
        const finish = (error) => {
          if (finished) return
          finished = true
          clearTimeout(timeout)
          dispose()
          if (error) reject(error)
          else resolve()
        }
        const inspect = () => {
          const snapshot = scope.getSnapshot()
          if (snapshot?.status !== 'ready') return
          if (Number.isInteger(previousRevision) && (!Number.isInteger(snapshot.revision) || snapshot.revision <= previousRevision)) return
          const profile = snapshot.value?.providers?.[PROVIDER]
          const actualIds = profile?.models?.map((model) => model.id).sort()
          const expectedIds = enabled.map((model) => model.id).sort()
          if (profile?.baseURL === baseURL && syncValueOf(profile.headers) === undefined &&
            JSON.stringify(actualIds) === JSON.stringify(expectedIds) &&
            (hasCredential ? profile.apiKeyEnv === CREDENTIAL_REF : profile.apiKeyEnv === undefined)) finish()
        }
        dispose = scope.subscribe(inspect)
        timeout = setTimeout(() => finish(new Error(messages.syncTimeout)), PROFILE_SYNC_TIMEOUT_MS)
        inspect()
      })
    }

    async function credentialStatusOf(remote) {
      try {
        const response = await remote.credentials.describe([CREDENTIAL_REF])
        if (!response.ok) return 'unknown'
        return response.value[CREDENTIAL_REF]?.configured === true ? 'configured' : 'missing'
      } catch {
        return 'unknown'
      }
    }

    async function discoverModels(baseURL, apiKey, messages) {
      let discovery
      try {
        const transportFetch = window.__DSH_TRANSPORT__?.fetch || globalThis.fetch
        const response = await transportFetch('/api/cliproxyapi/catalog', {
          method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', cache: 'no-store',
          body: JSON.stringify({ baseURL, ...(apiKey ? { apiKey } : {}) }),
        })
        if (!response.ok) throw new Error(messages.loadFailed)
        discovery = await response.json()
      } catch {
        throw new Error(messages.loadFailed)
      }
      if (!discovery.ok) throw new Error(messages.loadFailed)
      if (!discovery.value.length) throw new Error(messages.noModels)
      return discovery.value
    }

    async function installInitialProfile(remote, scope, selectionScope, baseURL, apiKey, draft, messages) {
      const initialSnapshot = scope.getSnapshot()
      if (initialSnapshot?.status !== 'ready' || !initialSnapshot.writable || !Number.isInteger(initialSnapshot.revision)) throw new Error(messages.saveFailed)
      const originalProfile = initialSnapshot.value?.providers?.[PROVIDER]
      const models = await discoverModels(baseURL, apiKey, messages)
      const selectionSnapshot = selectionScope.getSnapshot()
      if (selectionSnapshot?.status !== 'ready' || !selectionSnapshot.writable) throw new Error(messages.selectionUnavailable)
      const selection = { ...(selectionSnapshot.value?.modelSelection || {}), ...draft }
      const enabled = models.filter((model) => selection[model.id] !== false)
      if (!enabled.length) throw new Error(messages.needOneModel)

      const credential = await remote.credentials.describe([CREDENTIAL_REF])
      if (!credential.ok) throw new Error(messages.saveFailed)
      const configured = credential.ok && credential.value[CREDENTIAL_REF]?.configured === true
      let writesStarted = false
      try {
        if (Object.keys(draft).length) {
          writesStarted = true
          const selected = await selectionScope.mutate([{ op: 'set', path: ['modelSelection'], value: selection }], selectionSnapshot.revision)
          if (!selected) throw new Error(messages.partialSave)
        }
        if (apiKey) {
          writesStarted = true
          const saved = await remote.credentials.set(CREDENTIAL_REF, apiKey)
          if (!saved.ok) throw new Error(messages.partialSave)
        }
        let profileSnapshot = scope.getSnapshot()
        if (profileSnapshot?.status !== 'ready' || !profileSnapshot.writable || !Number.isInteger(profileSnapshot.revision)) throw new Error(messages.partialSave)
        if (!sameProfile(profileSnapshot.value?.providers?.[PROVIDER], originalProfile, Boolean(apiKey))) throw new Error(messages.partialSave)
        let previousRevision
        let saved = false
        for (let attempt = 0; attempt < 3; attempt += 1) {
          previousRevision = profileSnapshot.revision
          writesStarted = true
          saved = await scope.mutate([{
            op: 'set',
            path: ['providers', PROVIDER],
            value: bootstrapProfileOf(baseURL, enabled, Boolean(apiKey || configured), createSyncToken(), profileSnapshot.value?.providers?.[PROVIDER]),
          }], previousRevision)
          if (saved) break
          const refreshed = scope.getSnapshot()
          if (refreshed?.status !== 'ready' || !refreshed.writable || !Number.isInteger(refreshed.revision) || refreshed.revision <= previousRevision ||
            !sameProfile(refreshed.value?.providers?.[PROVIDER], originalProfile, Boolean(apiKey))) break
          profileSnapshot = refreshed
        }
        if (!saved) throw new Error(messages.partialSave)
        await waitForProfileSynchronization(scope, baseURL, previousRevision, enabled, Boolean(apiKey || configured), messages)
      } catch (error) {
        if (writesStarted) throw new Error(messages.partialSave, { cause: error })
        throw error
      }
    }
    function metadataValue(value, t) {
      if (value !== null && typeof value === 'object') {
        const entries = Object.entries(value)
        if (!entries.length) return React.createElement('span', { style: styles.status }, t('empty'))
        return React.createElement('ul', { style: styles.metadata }, entries.map(([key, child]) =>
          React.createElement('li', { key },
            child !== null && typeof child === 'object'
              ? React.createElement('details', { style: styles.details }, React.createElement('summary', { style: styles.summary }, key), metadataValue(child, t))
              : React.createElement('span', { style: styles.value }, key + ': ', String(child)),
          ),
        ))
      }
      return React.createElement('span', { style: styles.value }, String(value))
    }

    function modelEfforts(model, t) {
      const raw = model.catalogMetadata || {}
      const advertised = Array.isArray(raw.supported_reasoning_levels)
        ? raw.supported_reasoning_levels.map((entry) => typeof entry === 'string' ? entry : entry?.effort).filter((value) => typeof value === 'string')
        : Object.values(model.reasoningEfforts || {})
      const efforts = [...new Set(advertised)]
      return React.createElement('div', { style: styles.efforts },
        React.createElement('span', { style: styles.status }, efforts.length ? t('efforts') + ':' : t('effortUnknown')),
        efforts.map((effort) => React.createElement(Tag, { key: effort, tone: effort === raw.default_reasoning_level ? 'info' : 'neutral' }, effort)),
        typeof raw.default_reasoning_level === 'string' ? React.createElement('span', { style: styles.status }, t('defaultEffort') + ': ' + raw.default_reasoning_level) : null,
      )
    }

    function modelDetails(model, t) {
      const raw = model.catalogMetadata && typeof model.catalogMetadata === 'object' ? model.catalogMetadata : {}
      const source = (key) => model.catalogSources?.[key] === 'default' ? t('sourceDefault') : model.catalogSources?.[key] === 'cpa' ? t('sourceCPA') : ''
      const line = (label, value, provenance) => value === undefined || value === null ? null : React.createElement('p', { style: styles.status }, label, ': ', String(value), provenance ? ' (' + provenance + ')' : '')
      return React.createElement('details', { style: styles.details },
        React.createElement('summary', { style: styles.summary }, t('details')),
        line(t('context'), model.contextWindow?.toLocaleString(), source('contextWindow')),
        line(t('output'), model.maxTokens?.toLocaleString(), source('maxTokens')),
        line(t('modalities'), (model.inputModalities || model.input || []).join(', '), source('inputModalities')),
        raw.description != null ? React.createElement('div', null, t('description'), ': ', metadataValue(raw.description, t)) : null,
        raw.default_reasoning_level != null ? React.createElement('div', null, t('defaultEffort'), ': ', metadataValue(raw.default_reasoning_level, t)) : null,
        Array.isArray(raw.supported_reasoning_levels) ? React.createElement('div', null,
          t('efforts'),
          React.createElement('ul', { style: styles.metadata }, raw.supported_reasoning_levels.map((entry, index) =>
            React.createElement('li', { key: index, style: styles.value }, typeof entry === 'string' ? entry
              : entry && typeof entry.effort === 'string' ? entry.effort + (typeof entry.description === 'string' ? ' — ' + entry.description : '')
                : metadataValue(entry, t)),
          )),
        ) : model.reasoningEfforts ? React.createElement('div', null, t('efforts'), metadataValue(model.reasoningEfforts, t)) : null,
        React.createElement('details', { style: styles.details }, React.createElement('summary', { style: styles.summary }, t('rawDetails')), metadataValue(raw, t)),
      )
    }


    function SettingsTab({ scope, selectionScope, remote, t, view, useScope, useSelectionScope }) {
      if (view === 'summary') return 'CLIProxyAPI model gateway'
      const snapshot = useScope((value) => value)
      const selectionSnapshot = useSelectionScope((value) => value)
      const profile = snapshot?.value?.providers?.[PROVIDER]
      const [baseURL, setBaseURL] = useState(DEFAULT_BASE_URL)
      const [apiKey, setApiKey] = useState('')
      const [credentialStatus, setCredentialStatus] = useState('unknown')
      const [saving, setSaving] = useState(false)
      const [feedback, setFeedback] = useState({ text: '', error: false })
      const [models, setModels] = useState(undefined)
      const [draft, setDraft] = useState({})
      const [search, setSearch] = useState('')
      const [loadingModels, setLoadingModels] = useState(false)
      const requestGeneration = React.useRef(0)
      const readOnly = snapshot?.status === 'ready' && !snapshot.writable
      const selectionReady = selectionSnapshot?.status === 'ready' && selectionSnapshot.writable
      const canSave = snapshot?.status === 'ready' && snapshot.writable && selectionReady && !saving && !loadingModels
      useEffect(() => {
        if (snapshot?.status !== 'ready') return
        setBaseURL(typeof profile?.baseURL === 'string' && profile.baseURL.length > 0 ? profile.baseURL : DEFAULT_BASE_URL)
      }, [profile?.baseURL, snapshot?.status])

      useEffect(() => {
        let active = true
        const refresh = async () => {
          const status = await credentialStatusOf(remote)
          if (active) setCredentialStatus(status)
        }
        void refresh()
        const dispose = remote.$on('credentials/reference-updated', (ref) => {
          if (ref === CREDENTIAL_REF) void refresh()
        })
        return () => {
          active = false
          dispose()
        }
      }, [remote])
      const loadModels = async (sourceURL = baseURL, sourceKey = apiKey) => {
        const generation = ++requestGeneration.current
        setLoadingModels(true)
        setFeedback({ text: '', error: false })
        try {
          const url = sourceURL.trim().replace(/\/+$/, '')
          validBaseURL(url, { baseRequired: t('baseRequired'), baseInvalid: t('baseInvalid') })
          const result = await discoverModels(url, sourceKey.trim(), { loadFailed: t('loadFailed'), noModels: t('noModels') })
          if (generation === requestGeneration.current) setModels(result)
        } catch (error) {
          if (generation === requestGeneration.current) {
            setFeedback({ text: error instanceof Error ? error.message : t('loadFailed'), error: true })
          }
        } finally {
          if (generation === requestGeneration.current) setLoadingModels(false)
        }
      }

      useEffect(() => {
        if (snapshot?.status === 'ready' && profile?.baseURL) void loadModels(profile.baseURL, '')
        return () => { requestGeneration.current += 1 }
      }, [profile?.baseURL, snapshot?.status])

      const invalidateModels = () => {
        requestGeneration.current += 1
        setModels(undefined)
        setLoadingModels(false)
      }


      const submit = async (event) => {
        event.preventDefault()
        if (!canSave) return
        const nextBaseURL = baseURL.trim().replace(/\/+$/, '')
        const nextApiKey = apiKey.trim()
        setSaving(true)
        setFeedback({ text: '', error: false })
        try {
          validBaseURL(nextBaseURL, {
            baseRequired: t('baseRequired'),
            baseInvalid: t('baseInvalid'),
            noModels: t('noModels'),
          })
          await installInitialProfile(remote, scope, selectionScope, nextBaseURL, nextApiKey, draft, {
            noModels: t('noModels'),
            loadFailed: t('loadFailed'),
            needOneModel: t('needOneModel'),
            selectionUnavailable: t('selectionUnavailable'),
            saveFailed: t('saveFailed'),
            partialSave: t('partialSave'),
            syncTimeout: t('syncTimeout'),
          })
          setApiKey('')
          setDraft({})
          setFeedback({ text: t('saved'), error: false })
        } catch (error) {
          const safeMessages = ['baseRequired', 'baseInvalid', 'noModels', 'loadFailed', 'needOneModel', 'selectionUnavailable', 'saveFailed', 'partialSave', 'syncTimeout'].map((key) => t(key))
          setFeedback({ text: error instanceof Error && safeMessages.includes(error.message) ? error.message : t('partialSave'), error: true })
        } finally {
          setSaving(false)
        }
      }
      const isSelected = (model) => Object.prototype.hasOwnProperty.call(draft, model.id) ? draft[model.id] : selectionSnapshot?.value?.modelSelection?.[model.id] !== false
      const selectedCount = models?.filter(isSelected).length || 0
      const query = search.trim().toLowerCase()
      const filtered = models?.filter((model) => (model.name || '').toLowerCase().includes(query) || model.id.toLowerCase().includes(query))
      const selectLoaded = (checked) => setDraft((current) => ({ ...current, ...Object.fromEntries(models.map((model) => [model.id, checked])) }))

      return React.createElement(
        'div', { style: styles.section, 'aria-busy': saving || snapshot?.status === 'loading' },
        React.createElement('div', { style: styles.heading },
          React.createElement('h2', { style: styles.title }, t('title')),
          React.createElement('p', { style: styles.intro }, t('intro')),
        ),
        snapshot?.status === 'unavailable'
          ? React.createElement('p', { style: styles.statusError, role: 'alert' }, t('unavailable')) : null,
        readOnly ? React.createElement('p', { style: styles.status, role: 'status' }, t('readOnly')) : null,
        snapshot?.status === 'loading' ? React.createElement('p', { style: styles.status, role: 'status' }, t('loading')) : null,
        React.createElement('form', { style: styles.form, onSubmit: submit, noValidate: true },
          React.createElement('p', { style: styles.status, role: 'note' }, t('imageCapability')),
          React.createElement('label', { style: styles.field },
            React.createElement('span', { style: styles.label }, t('baseURL')),
            React.createElement(Input, { type: 'url', value: baseURL, autoComplete: 'url', disabled: !canSave, onChange: (event) => { invalidateModels(); setBaseURL(event.currentTarget.value) } }),
          ),
          React.createElement('label', { style: styles.field },
            React.createElement('span', { style: styles.labelRow },
              React.createElement('span', { style: styles.label }, t('apiKey')),
              credentialStatus === 'configured'
                ? React.createElement('span', { style: styles.credentialStatus, role: 'status' }, t('credentialConfiguredLabel')) : null,
            ),
            React.createElement(Input, { type: 'password', value: apiKey, placeholder: credentialStatus === 'configured' ? t('apiKeyConfiguredPlaceholder') : t('apiKeyPlaceholder'), autoComplete: 'off', disabled: !canSave, onChange: (event) => { invalidateModels(); setApiKey(event.currentTarget.value) } }),
          ),
          !selectionReady ? React.createElement('p', { style: styles.status, role: 'status' }, t('selectionUnavailable')) : null,
          React.createElement('div', { style: styles.field },
            React.createElement('span', { style: styles.label }, t('models')),
            React.createElement('p', { style: styles.status, role: 'note' }, t('modelsHelp')),
            React.createElement('p', { style: styles.status, role: 'note' }, t('metadataHelp')),
            models && selectedCount === 0 && profile ? React.createElement('p', { style: styles.statusError, role: 'alert' }, t('noEnabledRefresh')) : null,
            React.createElement('div', { style: styles.toolbar }, React.createElement(Button, { type: 'button', variant: 'outline', size: 'sm', disabled: !canSave, onClick: () => loadModels() }, loadingModels ? t('loadingModels') : t('loadModels'))),
            models ? React.createElement(React.Fragment, null,
              React.createElement('label', { style: styles.field }, React.createElement('span', { style: styles.label }, t('search')), React.createElement(Input, { type: 'search', value: search, onChange: (event) => setSearch(event.currentTarget.value) })),
              React.createElement('div', { style: styles.toolbar },
                React.createElement('span', { style: styles.status, role: 'status' }, selectedCount, ' ', t('selectedCount'), ' ', models.length),
                React.createElement(Button, { type: 'button', variant: 'outline', size: 'sm', style: { maxWidth: '100%', height: 'auto', minHeight: '28px', whiteSpace: 'normal' }, disabled: !canSave, onClick: () => selectLoaded(true) }, t('selectAll')),
                React.createElement(Button, { type: 'button', variant: 'outline', size: 'sm', style: { maxWidth: '100%', height: 'auto', minHeight: '28px', whiteSpace: 'normal' }, disabled: !canSave, onClick: () => selectLoaded(false) }, t('deselectAll')),
              ),
              filtered.length ? React.createElement('div', { style: styles.modelList, role: 'region', 'aria-label': t('models'), tabIndex: 0 }, filtered.map((model) => React.createElement('div', { key: model.id, style: styles.model },
                React.createElement('div', { style: styles.modelHeader }, React.createElement('div', { style: styles.modelName }, React.createElement(Checkbox, { label: t('enabled') + ' ' + (model.name || model.id), checked: isSelected(model), disabled: !canSave, onChange: (checked) => setDraft((current) => ({ ...current, [model.id]: checked })) })), React.createElement('span', { style: styles.status }, model.id)),
                React.createElement('p', { style: styles.status }, [model.contextWindow != null ? t('context') + ': ' + model.contextWindow.toLocaleString() + (model.catalogSources?.contextWindow === 'default' ? ' (' + t('sourceDefault') + ')' : '') : '', model.maxTokens != null ? t('output') + ': ' + model.maxTokens.toLocaleString() + (model.catalogSources?.maxTokens === 'default' ? ' (' + t('sourceDefault') + ')' : '') : '', (model.inputModalities || model.input || []).join(', ')].filter(Boolean).join(' · ')),
                modelEfforts(model, t),
                modelDetails(model, t),
              ))) : React.createElement('p', { style: styles.status, role: 'status' }, t('noMatches')),
            ) : null,
          ),
          feedback.text ? React.createElement('p', { style: feedback.error ? styles.statusError : styles.status, role: feedback.error ? 'alert' : 'status' }, feedback.text) : null,
          React.createElement('div', { style: styles.actions },
            React.createElement(Button, { type: 'submit', variant: 'primary', size: 'md', disabled: !canSave }, saving ? t('saving') : t('save')),
          ),
        ),
      )
    }

    function apply(ctx) {
      const remote = ctx.remote
      const locale = ctx.locale
      const configForms = ctx.configForms
      const scope = configForms.get(PI_NS)
      const selectionScope = configForms.get(DISCOVERY_NS)
      const t = locale.bind(SETTINGS_LOCALE_NS)
      const pluginT = locale.bind(SETTINGS_SUMMARY_NS)

      ctx.effect(() => locale.register(SETTINGS_LOCALE_NS, copy), 'dsh-provider-cpa: dictionaries')
      ctx.effect(() => locale.register(SETTINGS_SUMMARY_NS, {
        en: { title: 'CLIProxyAPI', description: 'Connect to a CLIProxyAPI model gateway.' },
        zh: { title: 'CLIProxyAPI', description: '连接 CLIProxyAPI 模型网关。' },
      }), 'dsh-provider-cpa: Plugins page copy')
      ctx.effect(() => configForms.whileServed([PI_NS, DISCOVERY_NS], () => ctx.slots.inject(SETTINGS_SLOT, () => ctx.slots.register({
        name: SETTINGS_SLOT,
        id: SETTINGS_TAB_ID,
        order: 30,
        label: () => pluginT('title'),
        description: () => pluginT('description'),
        locale: SETTINGS_SUMMARY_NS,
        inject: () => ({
          remote,
          scope,
          selectionScope,
          t,
          hooks: { scope, selectionScope },
        }),
      }, SettingsTab))), 'dsh-provider-cpa: settings page')
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
