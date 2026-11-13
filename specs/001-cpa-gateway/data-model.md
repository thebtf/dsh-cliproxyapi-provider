# Модель данных и состояния

## Подключение

Namespace `llm-cliproxyapi`: `baseURL`, enabled, auth identity, policy, modelSelection, overrides, generation, operationId, revision. URL только http/https, без userinfo, fragment и секретов в query; нормализация не меняет host/path. Один CAS публикует endpoint, auth identity, policy, selectionChanges и operationId. Старый generation не мутируется.

## Авторизация

`keep`, `replace(key)`, `reference(ref)`, `none` — разные явные действия. `replace` создаёт новый immutable owner-scoped record с operationId до CAS; значение не сохраняется в Config/cache/readback/backup. При CAS conflict старое подключение продолжает работать; удалять можно лишь созданный операцией record, доказанно без потребителей. При UNKNOWN сперва читать state, operationId и record; `listRecords()` находит незавершённые свои записи. Не применять таймерный GC; учитывать live-call, rollback и Config consumers. Внешняя reference разрешается раз за операцию; её значение не обещано неизменным на срок prepared-call.

## Каталог

Snapshot содержит schemaVersion, endpoint/auth identity, fetchedAt, raw и effective модели; путь `dshCachePath('llm-cliproxyapi', hash(settings.documentPath), connectionGeneration+'.json')`. Upstream JSON ≤4 MiB, cache ≤8 MiB. Запись temp+rename в том же каталоге; ошибка не уничтожает last-good. Повреждённый cache отвергается. Старый generation не публикуется в новый. Кэш не доказывает авторизацию. Потеря файла требует refresh, а не выдуманных моделей.

Effective capabilities: override пользователя → валидные данные CPA → настроенный fallback с provenance. Efforts берутся из CPA/override, не имени; output capability не становится автоматически request max_tokens. Выбор отсутствующих ID и явные false сохраняются; новые модели включены по умолчанию.

## Готовность и поколения

Состояния: not-configured, disabled, missing-credential, catalog-loading, ready/stale, reconfiguring, error. Регистрация существует только при enabled, разрешённой обязательной identity и хотя бы одной выбранной пригодной модели; auth=none допустим без key. Неготовность: `registration.replace([])` если handle существует, без пустой initial registration; восстановление возвращает прежний ID, чужой владелец — repair conflict. Credentials/reference-updated и record-updated перепроверяют используемую identity; отсутствие при resolve операции останавливает HTTP и обновляет статус. Изменение внешней env без события не обещает мгновенного обнаружения.

Prepared call фиксирует endpoint, модель, capabilities, policy и identity одного generation; значение credential разрешается раз за операцию. Изменение generation не меняет уже подготовленный snapshot.

## Перенос

`prepared` хранит candidate, legacy address/revision/fingerprint, non-secret profile и provenance=legacy; `cutover` фиксирует намерение до CAS-unset user-layer; `active` фиксирует новый владелец после readback и регистрации. Сохранять selections, efforts, defaults, headers, compat и retry policy; секреты отделять. Непереносимое блокирует перенос. После падения: legacy ещё есть — прежний маршрут; legacy удалён и candidate валиден — продолжить; rollback только в отсутствующий legacy path с актуальным CAS после снятия собственного route. Конфликт оставляет обе конфигурации и repair. После новых изменений переносить актуальные совместимые данные либо forward repair, не старый backup поверх них.

## Диагностика

Ограниченный runtime ring хранит размеры/количества, стадии, status и коррелируемые request ID; не хранит prompts, тела tools, Authorization или cookies. Отдельно различать отсутствие доставки CPA, HTTP, SSE, incomplete/empty, abort/timeout; не отождествлять разные ID без корреляции.
