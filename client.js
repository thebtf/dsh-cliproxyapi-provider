window.__ModuleLoader__.load({
  id: '@router-for-me/dsh-cliproxyapi-provider',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { Button, Input, Checkbox, Tag } = require('@deepseek-ai/dsh-client-ui-primitives')
    const { useEffect, useState } = React

    const DISCOVERY_NS = 'llm-cliproxyapi'
    const SETTINGS_SLOT = 'plugins.item'
    const SETTINGS_TAB_ID = 'cliproxyapi'
    const SETTINGS_LOCALE_NS = 'settings.cliProxyApi'
    const SETTINGS_SUMMARY_NS = 'llm-cliproxyapi'
    const inject = ['slots', 'locale', 'configForms', 'pluginNavigation']

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
    Object.assign(copy.en, { save: 'Save', saved: 'Changes saved.', statusNotConfigured: 'Not configured.', statusDisabled: 'Connection disabled.', statusMissingKey: 'Credential is missing.', statusLoading: 'Loading catalog…', statusReady: 'Ready.', statusStale: 'Catalog is stale.', statusReconfiguring: 'Reconfiguring…', statusNoModels: 'No selected usable models; the connection is not ready.', statusError: 'Connection error.', activationFailed: 'Saved, but activation failed. The connection is not ready.', catalogError: 'Catalog refresh failed; the last good catalog may be stale.', uncertain: 'The result is unknown. Your draft is preserved; check the operation before trying again.', conflict: 'Settings changed elsewhere. Your draft is preserved; review it before saving again.', operationId: 'Operation ID', reconcile: 'Check operation', authAction: 'Authentication action', authkeep: 'Keep current identity', authreplace: 'Replace with a key', authreference: 'Use a credential reference', authnone: 'No authentication', reference: 'Credential reference', keyRequired: 'Enter a key.', referenceRequired: 'Enter a credential reference.', reuseConsent: 'Allow the saved identity to be used with this endpoint', reuseRequired: 'Explicitly allow credential reuse before previewing this endpoint.', httpWarning: 'HTTP is not encrypted; credentials and requests can be exposed.', policy: 'Connection policy (JSON object)', policyInvalid: 'Enter a valid policy JSON object.', refresh: 'Refresh saved catalog', saveSelection: 'Save model selection only', disconnect: 'Disable connection', enableConnection: 'Enable connection', disconnectHelp: 'Disabling preserves the endpoint, key and model selection; existing sessions may fail until re-enabled.', forgetKey: 'Forget key', forgetHelp: 'Forgetting the key can make the connection unavailable; it does not select keyless authentication.', importLegacy: 'Import legacy connection', openSettings: 'Open Plugins, then select CLIProxyAPI', sourceOverride: 'override' })
    Object.assign(copy.zh, { save: '保存', saved: '更改已保存。', statusNotConfigured: '尚未配置。', statusDisabled: '连接已停用。', statusMissingKey: '缺少凭据。', statusLoading: '正在加载目录…', statusReady: '已就绪。', statusStale: '目录已过期。', statusReconfiguring: '正在重新配置…', statusNoModels: '没有已选可用模型；连接尚未就绪。', statusError: '连接错误。', activationFailed: '已保存，但激活失败。连接尚未就绪。', catalogError: '目录刷新失败；上次成功的目录可能已过期。', uncertain: '结果未知。草稿已保留；重试前请检查操作。', conflict: '设置已在其他位置更改。草稿已保留；保存前请检查。', operationId: '操作 ID', reconcile: '检查操作', authAction: '身份验证操作', authkeep: '保留当前身份', authreplace: '替换为密钥', authreference: '使用凭据引用', authnone: '不使用身份验证', reference: '凭据引用', keyRequired: '请输入密钥。', referenceRequired: '请输入凭据引用。', reuseConsent: '允许在此地址使用已保存的身份', reuseRequired: '预览此地址前请明确允许重用凭据。', httpWarning: 'HTTP 未加密，凭据和请求可能泄露。', policy: '连接策略（JSON 对象）', policyInvalid: '请输入有效的策略 JSON 对象。', refresh: '刷新已保存的目录', saveSelection: '仅保存模型选择', disconnect: '停用连接', enableConnection: '启用连接', disconnectHelp: '停用会保留地址、密钥和模型选择；重新启用前现有会话可能失败。', forgetKey: '忘记密钥', forgetHelp: '忘记密钥可能导致连接不可用；不会自动选择无验证模式。', importLegacy: '导入旧连接', openSettings: '打开插件，然后选择 CLIProxyAPI', sourceOverride: '用户覆盖' })
    copy.ru = { title: 'CLIProxyAPI', intro: 'Подключение сервера CLIProxyAPI и выбор моделей.', loading: 'Загрузка настроек…', unavailable: 'Настройки недоступны.', readOnly: 'Настройки доступны только для чтения.', baseURL: 'Адрес сервера', apiKey: 'Ключ API', baseRequired: 'Укажите адрес.', baseInvalid: 'Укажите корректный HTTP или HTTPS адрес.', save: 'Сохранить', saved: 'Изменения сохранены.', loadModels: 'Предпросмотр моделей', loadFailed: 'Не удалось загрузить каталог.', modelsHelp: 'Отключённые модели недоступны в DSH; существующие сессии могут завершиться ошибкой. Прямые вызовы CPA не блокируются. Новые модели включены по умолчанию.', search: 'Поиск по имени или ID', selectedCount: 'выбрано из', selectAll: 'Выбрать все модели', deselectAll: 'Снять выбор со всех', noMatches: 'Модели не найдены.', enabled: 'Включить', details: 'Сведения о модели', rawDetails: 'Все поля CPA', context: 'Контекст', output: 'Максимальный вывод', modalities: 'Типы входа', sourceDefault: 'по умолчанию', sourceCPA: 'CPA', sourceOverride: 'переопределение', efforts: 'Уровни рассуждения', defaultEffort: 'Уровень по умолчанию', description: 'Описание', empty: 'Пусто', effortUnknown: 'Уровни рассуждения не указаны', statusNotConfigured: 'Не настроено.', statusDisabled: 'Подключение отключено.', statusMissingKey: 'Нет учётных данных.', statusLoading: 'Загрузка каталога…', statusReady: 'Готово.', statusStale: 'Каталог устарел.', statusReconfiguring: 'Применение настроек…', statusNoModels: 'Нет выбранных доступных моделей; подключение не готово.', statusError: 'Ошибка подключения.', activationFailed: 'Сохранено, но активация не удалась. Подключение не готово.', catalogError: 'Обновить каталог не удалось; предыдущая копия может устареть.', uncertain: 'Результат неизвестен. Черновик сохранён; проверьте операцию перед повтором.', conflict: 'Настройки изменены в другом месте. Черновик сохранён; проверьте его.', operationId: 'ID операции', reconcile: 'Проверить операцию', authAction: 'Авторизация', authkeep: 'Оставить текущие данные', authreplace: 'Заменить ключ', authreference: 'Использовать ссылку на данные', authnone: 'Без авторизации', reference: 'Ссылка на учётные данные', keyRequired: 'Укажите ключ.', referenceRequired: 'Укажите ссылку.', reuseConsent: 'Разрешить использовать сохранённые данные с этим адресом', reuseRequired: 'Для предпросмотра явно разрешите повторное использование данных.', httpWarning: 'HTTP не шифруется: ключ и запросы могут быть раскрыты.', policy: 'Политика подключения (объект JSON)', policyInvalid: 'Укажите корректный объект JSON.', refresh: 'Обновить сохранённый каталог', saveSelection: 'Сохранить только выбор моделей', disconnect: 'Отключить подключение', enableConnection: 'Включить подключение', disconnectHelp: 'Отключение сохраняет адрес, ключ и выбор моделей; существующие сессии могут перестать работать.', forgetKey: 'Забыть ключ', forgetHelp: 'Удаление ключа может сделать подключение недоступным и не включает режим без авторизации.', importLegacy: 'Импортировать прежнее подключение', openSettings: 'Открыть Plugins и выбрать CLIProxyAPI' }
    Object.assign(copy.en, { openSettings: 'Open Plugins', chooseCPA: 'Then select CLIProxyAPI.', saveFailed: 'The operation was refused. Your draft is preserved.', revision: 'Readback revision' })
    Object.assign(copy.ru, { openSettings: 'Открыть плагины', chooseCPA: 'Затем выберите CLIProxyAPI.', saveFailed: 'Операция отклонена. Черновик сохранён.', revision: 'Прочитанная версия' })
    Object.assign(copy.zh, { openSettings: '打开插件', chooseCPA: '然后选择 CLIProxyAPI。', saveFailed: '操作被拒绝，草稿已保留。', revision: '读取的版本' })
    Object.assign(copy.en, { previewNone: 'Save keyless authentication before previewing without the saved credential.' })
    Object.assign(copy.ru, { previewNone: 'Чтобы выполнить предпросмотр без сохранённого ключа, сначала сохраните режим без авторизации.' })
    Object.assign(copy.zh, { previewNone: '请先保存无验证模式，再预览不使用已保存凭据的目录。' })
    Object.assign(copy.en, { retryOperation: 'Retry the same operation', returnToEdit: 'Return to editing', conflictPending: 'The result cannot be confirmed because settings changed. Return to editing and review your draft before saving.', diagnosticHttp: 'HTTP response', diagnosticPayload: 'Request payload', diagnosticBeforeHttp: 'Before HTTP response', diagnosticTimeout: 'Timeout', diagnosticAbort: 'Cancelled', diagnosticSseCompleted: 'Stream completed', diagnosticSseFailed: 'Stream failed', diagnosticSseIncomplete: 'Stream incomplete', diagnosticStatus: 'HTTP status', diagnosticRequestId: 'Request ID', diagnosticAt: 'Time', diagnosticToolCount: 'Tool count', catalogAuth: 'Catalog authentication failed. Check the credential.', catalogTimeout: 'Catalog request timed out.', catalogTransport: 'Could not reach the catalog endpoint.', catalogInvalidResponse: 'The catalog response is invalid.', catalogTooLarge: 'The catalog response is too large.' })
    Object.assign(copy.ru, { retryOperation: 'Повторить ту же операцию', returnToEdit: 'Вернуться к редактированию', conflictPending: 'Подтвердить результат нельзя: настройки изменились. Вернитесь к редактированию и проверьте черновик перед сохранением.', diagnosticHttp: 'Ответ HTTP', diagnosticPayload: 'Данные запроса', diagnosticBeforeHttp: 'До ответа HTTP', diagnosticTimeout: 'Время ожидания истекло', diagnosticAbort: 'Отменено', diagnosticSseCompleted: 'Поток завершён', diagnosticSseFailed: 'Ошибка потока', diagnosticSseIncomplete: 'Поток не завершён', diagnosticStatus: 'Статус HTTP', diagnosticRequestId: 'ID запроса', diagnosticAt: 'Время', diagnosticToolCount: 'Число инструментов', catalogAuth: 'Ошибка авторизации каталога. Проверьте учётные данные.', catalogTimeout: 'Время ожидания каталога истекло.', catalogTransport: 'Не удалось подключиться к каталогу.', catalogInvalidResponse: 'Некорректный ответ каталога.', catalogTooLarge: 'Ответ каталога слишком велик.' })
    Object.assign(copy.zh, { retryOperation: '重试同一操作', returnToEdit: '返回编辑', conflictPending: '设置已更改，无法确认结果。请返回编辑并在保存前检查草稿。', diagnosticHttp: 'HTTP 响应', diagnosticPayload: '请求载荷', diagnosticBeforeHttp: 'HTTP 响应前', diagnosticTimeout: '超时', diagnosticAbort: '已取消', diagnosticSseCompleted: '流已完成', diagnosticSseFailed: '流失败', diagnosticSseIncomplete: '流未完成', diagnosticStatus: 'HTTP 状态', diagnosticRequestId: '请求 ID', diagnosticAt: '时间', diagnosticToolCount: '工具数量', catalogAuth: '目录身份验证失败，请检查凭据。', catalogTimeout: '目录请求超时。', catalogTransport: '无法连接目录地址。', catalogInvalidResponse: '目录响应无效。', catalogTooLarge: '目录响应过大。' })

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

    function createOperationId() {
      return globalThis.crypto?.randomUUID?.() || String(Date.now()) + '-' + Math.random().toString(36).slice(2)
    }

    async function request(path, body) {
      const transportFetch = window.__DSH_TRANSPORT__?.fetch || globalThis.fetch
      const response = await transportFetch(path, body === undefined
        ? { credentials: 'same-origin', cache: 'no-store' }
        : { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', cache: 'no-store', body: JSON.stringify(body) })
      const result = await response.json()
      if (!result?.ok) {
        const error = new Error('gateway')
        error.code = result?.error?.code
        throw error
      }
      return result.value
    }

    const readState = () => request('/api/cliproxyapi/state')
    const command = (body) => request('/api/cliproxyapi/command', body)
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
        typeof (model.defaultReasoningEffort || raw.default_reasoning_level) === 'string' ? React.createElement('span', { style: styles.status }, t('defaultEffort') + ': ' + (model.defaultReasoningEffort || raw.default_reasoning_level)) : null,
      )
    }

    function modelDetails(model, t) {
      const raw = model.catalogMetadata && typeof model.catalogMetadata === 'object' ? model.catalogMetadata : {}
      const source = (key) => model.catalogSources?.[key] === 'default' ? t('sourceDefault') : model.catalogSources?.[key] === 'cpa' ? t('sourceCPA') : model.catalogSources?.[key] === 'override' ? t('sourceOverride') : ''
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


    const statusKeys = { 'not-configured': 'statusNotConfigured', disabled: 'statusDisabled', 'missing-credential': 'statusMissingKey', 'catalog-loading': 'statusLoading', ready: 'statusReady', stale: 'statusStale', reconfiguring: 'statusReconfiguring', 'no-models': 'statusNoModels', error: 'statusError' }
    const catalogErrorKeys = { CATALOG_AUTH: 'catalogAuth', CATALOG_TIMEOUT: 'catalogTimeout', CATALOG_TRANSPORT: 'catalogTransport', CATALOG_INVALID_RESPONSE: 'catalogInvalidResponse', CATALOG_TOO_LARGE: 'catalogTooLarge' }
    const diagnosticStageKeys = { http: 'diagnosticHttp', payload: 'diagnosticPayload', 'before-http': 'diagnosticBeforeHttp', timeout: 'diagnosticTimeout', abort: 'diagnosticAbort', 'sse-completed': 'diagnosticSseCompleted', 'sse-failed': 'diagnosticSseFailed', 'sse-incomplete': 'diagnosticSseIncomplete' }

    function diagnosticView(diagnostic, index, t) {
      const stage = Object.hasOwn(diagnosticStageKeys, diagnostic?.stage) ? diagnosticStageKeys[diagnostic.stage] : null
      if (!stage) return null
      const fields = [t(stage)]
      if (Number.isInteger(diagnostic.status) && diagnostic.status >= 100 && diagnostic.status <= 599) fields.push(t('diagnosticStatus') + ': ' + diagnostic.status)
      if (typeof diagnostic.requestId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(diagnostic.requestId)) fields.push(t('diagnosticRequestId') + ': ' + diagnostic.requestId)
      if (Number.isFinite(diagnostic.at) && diagnostic.at >= 0 && diagnostic.at <= 8640000000000000) fields.push(t('diagnosticAt') + ': ' + new Date(diagnostic.at).toISOString())
      if (Number.isSafeInteger(diagnostic.toolCount) && diagnostic.toolCount >= 0) fields.push(t('diagnosticToolCount') + ': ' + diagnostic.toolCount)
      return React.createElement('p', { key: index, role: 'status' }, fields.join(' · '))
    }

    function SettingsTab({ t, view, useScope }) {
      if (view === 'summary') return t('intro')
      const snapshot = useScope((value) => value)
      const [state, setState] = useState(null)
      const [baseURL, setBaseURL] = useState('')
      const [apiKey, setApiKey] = useState('')
      const [authType, setAuthType] = useState('keep')
      const [reference, setReference] = useState('')
      const [reuse, setReuse] = useState(false)
      const [policy, setPolicy] = useState('{}')
      const [draft, setDraft] = useState({})
      const [models, setModels] = useState(null)
      const [search, setSearch] = useState('')
      const [busy, setBusy] = useState(false)
      const [feedback, setFeedback] = useState('')
      const [pending, setPending] = useState(null)
      const [lastOperation, setLastOperation] = useState(null)
      const requestGeneration = React.useRef(0)
      const writable = snapshot?.status === 'ready' && snapshot.writable && state && !busy && !pending
      useEffect(() => {
        let active = true
        readState().then((value) => {
          if (!active) return
          setState(value); setBaseURL(value.baseURL || ''); setPolicy(JSON.stringify(value.policy || {}, null, 2)); setModels(value.models || [])
        }).catch(() => { if (active) setFeedback(t('unavailable')) })
        return () => { active = false; requestGeneration.current += 1 }
      }, [])
      const complete = (operation, value) => {
        setState(value); setModels(value.models || []); setPending(null); setFeedback(t('saved'))
        if (operation.type === 'save-connection') { setDraft({}); setApiKey(''); setAuthType('keep') }
        if (operation.type === 'save-selection') setDraft({})
      }
      const reconcile = async (operation) => {
        try {
          const value = await readState()
          setState(value)
          if (value.operationId === operation.operationId && value.revision > operation.expectedRevision) {
            complete(operation, value)
            return true
          }
          setFeedback(t(value.revision !== operation.expectedRevision ? 'conflictPending' : 'uncertain'))
          return false
        } catch { setFeedback(t('uncertain')); return false }
      }
      const sendOperation = async (operation, retry = false) => {
        setBusy(true); setFeedback('')
        try {
          const value = await command(operation)
          complete(operation, value)
        } catch (error) {
          if (String(error.code || '').toUpperCase().includes('CONFLICT')) {
            if (retry) { setPending(operation); await reconcile(operation) }
            else { try { setState(await readState()) } catch { }; setFeedback(t('conflict')) }
          } else if (error.code && !String(error.code).toUpperCase().includes('UNKNOWN')) {
            if (retry) setPending(operation)
            setFeedback(t('saveFailed'))
          } else {
            setPending(operation)
            await reconcile(operation)
          }
        } finally { setBusy(false) }
      }
      const mutate = async (type, fields = {}) => {
        if (!writable) return
        const operation = { type, expectedRevision: state.revision, operationId: createOperationId(), ...fields }
        setLastOperation(operation.operationId)
        await sendOperation(operation)
      }
      const returnToEdit = async (operation) => {
        setBusy(true)
        try {
          const value = await readState()
          if (value.operationId === operation.operationId && value.revision > operation.expectedRevision) complete(operation, value)
          else { setState(value); setPending(null); setFeedback(t('conflict')) }
        } catch { setFeedback(t('uncertain')) }
        finally { setBusy(false) }
      }
      const submit = (event) => {
        event.preventDefault()
        try {
          validBaseURL(baseURL.trim(), { baseRequired: t('baseRequired'), baseInvalid: t('baseInvalid') })
          const parsedPolicy = JSON.parse(policy)
          if (!parsedPolicy || Array.isArray(parsedPolicy) || typeof parsedPolicy !== 'object') throw new Error(t('policyInvalid'))
          if (authType === 'replace' && !apiKey) throw new Error(t('keyRequired'))
          if (authType === 'reference' && !reference.trim()) throw new Error(t('referenceRequired'))
          const authEdit = authType === 'replace' ? { type: 'replace', key: apiKey } : authType === 'reference' ? { type: 'reference', ref: reference.trim(), allowEndpointReuse: reuse } : authType === 'keep' ? { type: 'keep', allowEndpointReuse: reuse } : { type: 'none' }
          return mutate('save-connection', { baseURL: baseURL.trim(), authEdit, policy: parsedPolicy, selectionChanges: draft })
        } catch (error) { setFeedback([t('baseRequired'), t('baseInvalid'), t('keyRequired'), t('referenceRequired')].includes(error.message) ? error.message : t('policyInvalid')) }
      }
      const preview = async () => {
        const generation = ++requestGeneration.current
        setBusy(true); setFeedback('')
        try {
          validBaseURL(baseURL.trim(), { baseRequired: t('baseRequired'), baseInvalid: t('baseInvalid') })
          if (state?.baseURL !== baseURL.trim() && state?.keyConfigured && !(authType === 'replace' && apiKey) && !reuse) throw new Error(t('reuseRequired'))
          if (authType === 'none' && state?.keyConfigured) throw new Error(t('previewNone'))
          const value = await command({ type: 'preview-models', baseURL: baseURL.trim(), ...(authType === 'replace' && apiKey ? { apiKey } : {}), allowEndpointReuse: reuse })
          if (generation === requestGeneration.current) setModels(value)
        } catch (error) { if (generation === requestGeneration.current) setFeedback([t('reuseRequired'), t('previewNone')].includes(error.message) ? error.message : t('loadFailed')) }
        finally { if (generation === requestGeneration.current) setBusy(false) }
      }
      const refresh = async () => {
        setBusy(true); setFeedback('')
        try { const value = await command({ type: 'refresh-models', connectionGeneration: state.generation }); setState(value); setModels(value.models || []) }
        catch { setFeedback(t('loadFailed')); try { setState(await readState()) } catch { } }
        finally { setBusy(false) }
      }
      const list = models || []
      const selected = (model) => Object.hasOwn(draft, model.id) ? draft[model.id] : state?.modelSelection?.[model.id] !== false
      const filtered = list.filter((model) => (model.name || '').toLowerCase().includes(search.toLowerCase()) || model.id.toLowerCase().includes(search.toLowerCase()))
      const button = (label, action, disabled = !writable) => React.createElement(Button, { type: 'button', disabled, onClick: action }, t(label))
      return React.createElement('div', { style: styles.section, 'aria-busy': busy || !state },
        React.createElement('h2', { style: styles.title }, t('title')),
        React.createElement('p', { style: styles.status }, t('intro')),
        !state ? React.createElement('p', { role: 'status' }, t('loading')) : React.createElement('p', { role: 'status' }, t(statusKeys[state.status] || 'statusError')),
        snapshot?.status === 'ready' && !snapshot.writable ? React.createElement('p', { role: 'status' }, t('readOnly')) : null,
        state?.activationError ? React.createElement('p', { role: 'alert' }, t('activationFailed')) : null,
        state ? React.createElement('p', { role: 'status' }, t('revision'), ': ', state.revision, state.operationId ? ' · ' + t('operationId') + ': ' + state.operationId : '') : null,
        lastOperation ? React.createElement('p', { role: 'status' }, t('operationId'), ': ', lastOperation) : null,
        state?.catalog?.error ? React.createElement('p', { role: 'status' }, t(Object.hasOwn(catalogErrorKeys, state.catalog.error.code) ? catalogErrorKeys[state.catalog.error.code] : 'catalogError')) : null,
        (state?.diagnostics || []).map((diagnostic, index) => diagnosticView(diagnostic, index, t)),
        feedback ? React.createElement('p', { role: 'status' }, feedback) : null,
        pending ? React.createElement('div', null, React.createElement('p', null, t('operationId'), ': ', pending.operationId), button('reconcile', async () => { setBusy(true); try { await reconcile(pending) } finally { setBusy(false) } }, busy), button('retryOperation', () => sendOperation(pending, true), busy || snapshot?.status !== 'ready' || !snapshot.writable), button('returnToEdit', () => returnToEdit(pending), busy)) : null,
        React.createElement('form', { style: styles.form, onSubmit: submit },
          React.createElement('label', { style: styles.field }, t('baseURL'), React.createElement(Input, { type: 'url', value: baseURL, disabled: !writable, onChange: (event) => { requestGeneration.current += 1; setBaseURL(event.currentTarget.value); setReuse(false); setApiKey('') } })),
          baseURL.trim().toLowerCase().startsWith('http:') ? React.createElement('p', { role: 'note' }, t('httpWarning')) : null,
          React.createElement('label', { style: styles.field }, t('authAction'), React.createElement('select', { value: authType, disabled: !writable, onChange: (event) => setAuthType(event.currentTarget.value) }, ['keep', 'replace', 'reference', 'none'].map((type) => React.createElement('option', { key: type, value: type }, t('auth' + type))))),
          authType === 'replace' ? React.createElement('label', { style: styles.field }, t('apiKey'), React.createElement(Input, { type: 'password', value: apiKey, autoComplete: 'off', disabled: !writable || !state?.keyWritable, onChange: (event) => setApiKey(event.currentTarget.value) })) : null,
          authType === 'reference' ? React.createElement('label', { style: styles.field }, t('reference'), React.createElement(Input, { value: reference, disabled: !writable, onChange: (event) => setReference(event.currentTarget.value) })) : null,
          state?.baseURL && baseURL.trim() !== state.baseURL && (authType === 'keep' || authType === 'reference') ? React.createElement(Checkbox, { label: t('reuseConsent'), checked: reuse, disabled: !writable, onChange: setReuse }) : null,
          React.createElement('label', { style: styles.field }, t('policy'), React.createElement('textarea', { value: policy, disabled: !writable, onChange: (event) => setPolicy(event.currentTarget.value) })),
          React.createElement('p', { role: 'note' }, t('modelsHelp')),
          React.createElement('div', { style: styles.toolbar }, button('loadModels', preview), button('refresh', refresh, !writable || !state?.generation)),
          React.createElement('label', { style: styles.field }, t('search'), React.createElement(Input, { type: 'search', value: search, onChange: (event) => setSearch(event.currentTarget.value) })),
          React.createElement('div', { style: styles.toolbar }, React.createElement('span', null, list.filter(selected).length, ' ', t('selectedCount'), ' ', list.length), button('selectAll', () => setDraft((current) => ({ ...current, ...Object.fromEntries(list.map((model) => [model.id, true])) }))), button('deselectAll', () => setDraft((current) => ({ ...current, ...Object.fromEntries(list.map((model) => [model.id, false])) })))),
          list.length && !list.filter(selected).length ? React.createElement('p', { role: 'status' }, t('statusNoModels')) : null,
          React.createElement('div', { style: styles.modelList }, filtered.map((model) => React.createElement('div', { key: model.id, style: styles.model }, React.createElement(Checkbox, { label: t('enabled') + ' ' + (model.name || model.id), checked: selected(model), disabled: !writable, onChange: (checked) => setDraft((current) => ({ ...current, [model.id]: checked })) }), React.createElement('span', null, model.id), modelEfforts(model, t), modelDetails(model, t)))),
          list.length && !filtered.length ? React.createElement('p', { role: 'status' }, t('noMatches')) : null,
          React.createElement(Button, { type: 'submit', disabled: !writable }, t('save')),
          button('saveSelection', () => mutate('save-selection', { selectionChanges: draft })),
          button(state?.enabled ? 'disconnect' : 'enableConnection', () => mutate('set-enabled', { enabled: !state.enabled }), !writable || !state?.configured),
          React.createElement('p', { role: 'note' }, t('disconnectHelp')),
          button('forgetKey', () => mutate('forget-key'), !writable || !state?.keyConfigured),
          React.createElement('p', { role: 'note' }, t('forgetHelp')),
          state?.legacy?.available ? button('importLegacy', () => mutate('import-legacy', { expectedLegacyRevision: state.legacy.revision, fingerprint: state.legacy.fingerprint })) : null,
        ),
      )
    }

    function ModelsFooter({ t, pluginNavigation }) {
      const [state, setState] = useState(null)
      useEffect(() => { let active = true; readState().then((value) => { if (active) setState(value) }).catch(() => { }); return () => { active = false } }, [])
      return React.createElement('div', null, React.createElement('p', { role: 'status' }, 'CLIProxyAPI: ', t(state ? statusKeys[state.status] || 'statusError' : 'loading')), React.createElement(Button, { type: 'button', onClick: () => pluginNavigation.openList() }, t('openSettings')), React.createElement('p', null, t('chooseCPA')))
    }

    function apply(ctx) {
      const locale = ctx.locale
      const scope = ctx.configForms.get(DISCOVERY_NS)
      const t = locale.bind(SETTINGS_LOCALE_NS)
      const pluginT = locale.bind(SETTINGS_SUMMARY_NS)
      ctx.effect(() => locale.register(SETTINGS_LOCALE_NS, copy), 'dsh-provider-cpa: dictionaries')
      ctx.effect(() => locale.register(SETTINGS_SUMMARY_NS, { en: { title: 'CLIProxyAPI', description: 'Connect to a CLIProxyAPI model gateway.' }, ru: { title: 'CLIProxyAPI', description: 'Подключение к шлюзу CLIProxyAPI.' }, zh: { title: 'CLIProxyAPI', description: '连接 CLIProxyAPI 模型网关。' } }), 'dsh-provider-cpa: Plugins page copy')
      ctx.effect(() => ctx.configForms.whileServed([DISCOVERY_NS], () => ctx.slots.inject(SETTINGS_SLOT, () => ctx.slots.register({ name: SETTINGS_SLOT, id: SETTINGS_TAB_ID, order: 30, label: () => pluginT('title'), description: () => pluginT('description'), locale: SETTINGS_SUMMARY_NS, inject: () => ({ t, hooks: { scope } }) }, SettingsTab))), 'dsh-provider-cpa: settings page')
      ctx.effect(() => ctx.slots.inject('settings.models.footer', () => ctx.slots.register({ name: 'settings.models.footer', id: 'cliproxyapi', inject: () => ({ t, pluginNavigation: ctx.pluginNavigation }) }, ModelsFooter)), 'dsh-provider-cpa: models footer')
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
