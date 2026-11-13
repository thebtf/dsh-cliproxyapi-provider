# Контракты шлюза

Использовать существующий authenticated Connection transport и контроль доступа; отдельный HTTP-сервер не открывать. Это проект контракта, не утверждение о готовой реализации.

## Host state и команды

`GET /api/cliproxyapi/state`: revision, configured/disabled, key-status без значения, freshness, модели, безопасный последний сбой и статус активации. Read-only/host unavailable видимы.

`POST /api/cliproxyapi/command`: одна команда за запрос:

| Команда | Вход | Результат и ошибки |
| --- | --- | --- |
| `save-connection` | expectedRevision, operationId, baseURL, authEdit, policy, optional selectionChanges | Один CAS после подготовки credential возвращает revision/generation; invalid URL, auth reuse, credentials failure, conflict и UNKNOWN не считаются полным успехом. Commit и activation failure сообщаются раздельно. |
| `preview-models` | draft URL и явный key либо разрешённая identity | Каталог черновика; активный маршрут и каталог не меняются; старый key не подставляется на новый URL. |
| `refresh-models` | connectionGeneration | Проверенный snapshot; timeout/auth/invalid response сохраняет last-good как stale; ответ старого поколения отвергается. |
| `save-selection` | expectedRevision, изменения ID | Новый выбор и generation; конфликт не затирает draft, неизвестный ID не становится моделью. |
| `set-enabled` | expectedRevision, enabled | Route скрыт/возвращён; сохранены настройки, key и выбор; повтор того же состояния — no-op. |
| `import-legacy` | expected own/legacy revisions и fingerprint | Однозначный перенос; отсутствие URL, чужой владелец, конфликт и частичный cutover — явные отказы/recovery. |

Переходный `POST /api/cliproxyapi/catalog` сохраняется до обновления клиента и соблюдает те же правила binding endpoint/key. Для нового endpoint reuse требует явного разрешения. Scoped fetch отклоняет другой origin и redirects, способные передать credentials.

## Native вызов

Сохранять provider `CLIProxyAPI`, model-id, `PreparedAdapterCall` и `StreamChunk`, signal/deadline, атрибуцию, сообщения, изображения, replay и все tools/schemas. Для Responses установить explicit `strict:false`; не менять schemas и не включать strict:true. Unsupported effort — отказ до HTTP. SDK retries 0; единственный inference retry-owner — native Agent recovery, внутренние повторы CPA принадлежат CPA. Bounded backoff каталога — отдельный механизм. Открытие настроек не выполняет пробный completion.

Публичный `PiAiAdapter`, `ResolvedPiAiProviderProfile.piProvider`, `createProvider`, `ProviderStreams`, `fetch`, `onPayload`, `onResponse`; не импортировать закрытые конвертеры, `resolveProfiles()` или `/src/*`. Ошибки сохраняют metadata/request ID без утверждения эквивалентности разных ID без корреляции.

## Models

`settings.models.footer` добавляет безопасный CPA status и кнопку «Открыть плагины». Проверенный публичный pluginNavigation предоставляет openList/openBundle, но не прямое открытие settings item: footer вызывает openList и явно предлагает выбрать CLIProxyAPI; затем штатный пункт открывает настройки. Не обещать one-click deep-link. `settings.models.provider-card` — extras, не замена штатных Edit/Delete. Полная owner-controlled строка, фальшивый profile, перехват DOM и подмена экрана не входят в контракт.

## Зафиксированная JSON-форма для Host и клиента

Дискриминатор команды — `type`; дискриминатор authEdit и сохранённой authIdentity — `type`. `authEdit` принимает `{type:'keep', allowEndpointReuse?:boolean}`, `{type:'replace', key:string}`, `{type:'reference', ref:string, allowEndpointReuse?:boolean}` либо `{type:'none'}`. Замена и reference — явные действия; пустое поле ключа не означает none. Корневая регрессия T002 использует эту форму.

GET state и успешная команда возвращают `{ok:true,value:StateView}`. Preview и переходный POST catalog возвращают `{ok:true,value:ModelView[]}` и не меняют active state. Ошибка возвращает `{ok:false,error:{code,message,details:{...}}}` с соответствующим HTTP status, без raw upstream body/stack/credentials.

`StateView`: `revision:number`, `generation?:string`, `operationId?:string`, `configured:boolean`, `enabled:boolean`, `baseURL:string|null`, `authMode:'record'|'reference'|'none'|null`, `keyConfigured:boolean`, `keyWritable:boolean`, `modelSelection:Record<string,boolean>`, `policy:object`, `models:ModelView[]`, `status:'not-configured'|'disabled'|'missing-credential'|'catalog-loading'|'ready'|'stale'|'reconfiguring'|'no-models'|'error'`, `catalog:{freshness:'empty'|'loading'|'fresh'|'stale',fetchedAt?:number,error?:{code,message}}`, `diagnostics:SafeDiagnostic[]`, `activationError?:{code,message}`, `legacy?:{available:boolean,baseURL?:string,revision?:number,fingerprint?:string,reason?:string}`. В legacy и policy нет значений секретов. `configured` не равно ready.

`ModelView` сохраняет нынешний rich catalog format: `id`, `name`, `contextWindow`, `maxTokens`, `inputModalities`, optional `reasoningEfforts`, `defaultReasoningEffort`, `catalogSources` и `catalogMetadata` (все безопасные неизвестные поля CPA). Существующий renderer metadata остаётся применим. `preview-models` принимает `baseURL`, optional явно введённый `apiKey` и `allowEndpointReuse`; без key используется saved identity только для точного saved endpoint либо при явном reuse. `save-selection` принимает `selectionChanges`; `refresh-models` допускает только актуальный `connectionGeneration`.

`set-enabled` принимает `enabled`; явный forget-key — `forget-key` с expectedRevision и operationId, переводит требующий key режим в missing-credential, а не none. `import-legacy` принимает expectedRevision, expectedLegacyRevision и fingerprint. Записывающие команды несут expectedRevision и operationId; no-op set-enabled сохраняет идемпотентность. Сначала публикуется полное состояние, затем возвращается readback; activationError не скрывает подтверждённую запись.
