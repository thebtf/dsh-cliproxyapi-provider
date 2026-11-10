window.__ModuleLoader__.load({
  id: '@router-for-me/dsh-cliproxyapi-provider',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
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
    const inject = ['slots', 'locale', 'remote', 'remote.llm', 'remote.credentials', 'configForms']

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
      },
    }

    const styles = {
      section: { boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '720px', padding: '24px 16px 40px', margin: '0 auto', color: 'var(--dsw-alias-label-primary)' },
      heading: { display: 'flex', flexDirection: 'column', gap: '6px' },
      title: { margin: 0, fontSize: '16px', fontWeight: 600 },
      intro: { margin: 0, color: 'var(--dsw-alias-label-secondary)', fontSize: '13px', lineHeight: 1.5 },
      form: { display: 'flex', flexDirection: 'column', gap: '16px' },
      field: { display: 'flex', flexDirection: 'column', gap: '7px' },
      label: { fontSize: '14px', fontWeight: 500 },
      labelRow: { display: 'flex', alignItems: 'center', gap: '8px' },
      credentialStatus: { color: 'var(--dsw-alias-label-secondary)', fontSize: '12px', fontWeight: 400 },
      input: { boxSizing: 'border-box', width: '100%', minHeight: '38px', border: '1px solid var(--dsw-alias-border-primary)', borderRadius: '10px', background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', padding: '8px 12px', font: 'inherit' },
      status: { margin: 0, color: 'var(--dsw-alias-label-secondary)', fontSize: '13px', lineHeight: 1.4 },
      statusError: { margin: 0, color: 'var(--dsw-alias-status-danger)', fontSize: '13px', lineHeight: 1.4 },
      actions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '4px' },
      button: { cursor: 'pointer', minHeight: '38px', border: '1px solid transparent', borderRadius: '10px', background: 'var(--dsw-alias-brand-primary)', color: 'var(--dsw-alias-label-inverse, #fff)', padding: '8px 14px', font: 'inherit', fontWeight: 600 },
      buttonDisabled: { cursor: 'default', opacity: 0.75 },
      modelList: { display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '360px', overflowY: 'auto' },
      model: { display: 'flex', alignItems: 'flex-start', gap: '8px' },
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
        models: models.map((model) => ({
          id: model.id,
          name: model.name || model.id,
          contextWindow: model.contextWindow || 262144,
          maxTokens: model.maxTokens || 32768,
          input: Array.isArray(model.inputModalities) && model.inputModalities.length
            ? [...model.inputModalities]
            : ['text'],
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

    async function discoverModels(remote, baseURL, apiKey, messages) {
      let discovery
      try {
        discovery = await remote.llm.discoverModels(DISCOVERY_NS, {
          provider: PROVIDER,
          baseURL,
          api: 'openai-responses',
          ...(apiKey ? { apiKey } : {}),
        })
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
      const models = await discoverModels(remote, baseURL, apiKey, messages)
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
          const result = await discoverModels(remote, url, sourceKey.trim(), { loadFailed: t('loadFailed'), noModels: t('noModels') })
          if (generation === requestGeneration.current) setModels(result)
        } catch (error) {
          if (generation === requestGeneration.current) {
            setModels(undefined)
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
            React.createElement('input', { style: styles.input, type: 'url', value: baseURL, autoComplete: 'url', disabled: !canSave, onChange: (event) => { invalidateModels(); setBaseURL(event.currentTarget.value) } }),
          ),
          React.createElement('label', { style: styles.field },
            React.createElement('span', { style: styles.labelRow },
              React.createElement('span', { style: styles.label }, t('apiKey')),
              credentialStatus === 'configured'
                ? React.createElement('span', { style: styles.credentialStatus, role: 'status' }, t('credentialConfiguredLabel')) : null,
            ),
            React.createElement('input', { style: styles.input, type: 'password', value: apiKey, placeholder: credentialStatus === 'configured' ? t('apiKeyConfiguredPlaceholder') : t('apiKeyPlaceholder'), autoComplete: 'off', disabled: !canSave, onChange: (event) => { invalidateModels(); setApiKey(event.currentTarget.value) } }),
          ),
          !selectionReady ? React.createElement('p', { style: styles.status, role: 'status' }, t('selectionUnavailable')) : null,
          React.createElement('div', { style: styles.field },
            React.createElement('span', { style: styles.label }, t('models')),
            React.createElement('p', { style: styles.status, role: 'note' }, t('modelsHelp')),
            React.createElement('p', { style: styles.status, role: 'note' }, t('metadataHelp')),
            models && models.every((model) => (Object.prototype.hasOwnProperty.call(draft, model.id) ? draft[model.id] : selectionSnapshot.value?.modelSelection?.[model.id] !== false) === false) && profile
              ? React.createElement('p', { style: styles.statusError, role: 'alert' }, t('noEnabledRefresh')) : null,
            React.createElement('button', { type: 'button', style: styles.button, disabled: !canSave, onClick: () => loadModels() }, loadingModels ? t('loadingModels') : t('loadModels')),
            models ? React.createElement('div', { style: styles.modelList }, models.map((model) => {
              const selected = Object.prototype.hasOwnProperty.call(draft, model.id) ? draft[model.id] : selectionSnapshot.value?.modelSelection?.[model.id] !== false
              const metadata = [model.id, model.contextWindow && `context: ${model.contextWindow}`, model.maxTokens && `output: ${model.maxTokens}`, (model.inputModalities || []).join(', ')].filter(Boolean).join(' · ')
              return React.createElement('label', { key: model.id, style: styles.model },
                React.createElement('input', { type: 'checkbox', checked: selected, disabled: !canSave, onChange: (event) => { const checked = event.currentTarget.checked; setDraft((current) => ({ ...current, [model.id]: checked })) } }),
                React.createElement('span', null, model.name || model.id, React.createElement('small', { style: { ...styles.status, display: 'block' } }, metadata)),
              )
            })) : null,
          ),
          feedback.text ? React.createElement('p', { style: feedback.error ? styles.statusError : styles.status, role: feedback.error ? 'alert' : 'status' }, feedback.text) : null,
          React.createElement('div', { style: styles.actions },
            React.createElement('button', { type: 'submit', style: canSave ? styles.button : { ...styles.button, ...styles.buttonDisabled }, disabled: !canSave }, saving ? t('saving') : t('save')),
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
