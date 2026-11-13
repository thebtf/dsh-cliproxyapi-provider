---
description: "Задачи самостоятельного CPA-шлюза"
---

# Tasks: Самостоятельное подключение CPA

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/gateway.md](contracts/gateway.md).
**Формат**: `- [ ] T### [US#] действие с путями`. Только этот файл — источник задач Spec Kit. Состояние каждой задачи подтверждается отдельным доказательством; пока все задачи открыты.

## Phase 1: Setup (Shared Infrastructure)

- [x] T002 Сначала добавить в `test/gateway.test.js` регрессию собственного подключения без generic profile через существующий публичный вход; сохранить сценарии 0.3.1 в `test/index.test.js`, `test/client.test.js`, `test/catalog.test.js` и исправить locale-зависимое ожидание теста без изменения поведения. Root наблюдал meaningful RED: 9 PASS, 1 assertion failure на отсутствии собственного command route, без production-правок; `.agent/runs/cpa-gateway/gateway-red.txt`.
- [x] T001 После принятого RED добавить прямые публичные зависимости DSH и совместимый SDK в `package.json`, обновить `package-lock.json`; предусмотреть проверку SDK 1.3 и 1.5 без надежды на hoisting.

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T003 Реализовать в `src/connection.js` валидацию http/https URL без userinfo, fragment и секретов query, без изменения host/path; определить authEdit keep/replace/reference/none, revision/generation/operationId и явное разрешение reuse при смене endpoint. [FR-001, FR-003, FR-004]
- [x] T004 Реализовать в `src/connection.js` подготовку immutable owner-scoped credential до одного Settings CAS всего draft; UNKNOWN сверять по state/operationId/record, конфликт не меняет активное подключение; cleanup только доказанно неиспользуемых собственных records с учётом live calls/rollback/config и без таймерного GC. [FR-002, FR-003]
- [x] T005 Реализовать в `src/catalog-store.js` host cache `dshCachePath('llm-cliproxyapi', hash(settings.documentPath), connectionGeneration+'.json')`, лимиты 4 MiB upstream и 8 MiB cache, temp+rename, last-good/stale, отказ повреждённого cache и изоляцию поколения/auth/profile. [FR-005]
- [x] T006 Расширить `src/catalog.js` происхождением возможностей override → валидные данные CPA → fallback, безопасной полной metadata, efforts из CPA/override, сохранением false/отсутствующих ID и включением новых моделей по умолчанию; не превращать output capability в request max_tokens. [FR-006, FR-007, FR-009]
- [x] T007 Добавить в `test/connection.test.js` и `test/catalog.test.js` проверки URL, binding, CAS/UNKNOWN, безопасной очистки, лимитов и повреждений cache, выбора и приоритета возможностей. [FR-002–FR-007]

## Phase 3: User Story 1 - Подключение и продолжение сессии (Priority: P1)

**Goal**: сохранить полное подключение и обслуживать старую сессию без generic profile.
**Independent Test**: изолированный профиль, сохранение, перезапуск, выбор и продолжение существующей сессии; `quickstart.md`.

- [x] T008 [US1] Реализовать `src/adapter.js` на публичных `PiAiAdapter`, `ResolvedPiAiProviderProfile.piProvider`, `createProvider` и `ProviderStreams`: immutable snapshot endpoint/model/capabilities/policy/identity, один resolve credential за операцию, стабильный provider `CLIProxyAPI`. [FR-008, FR-009]
- [x] T009 [US1] Реализовать `src/transport.js`: Responses `strict:false`, неизменённые tools/schemas/history/images/replay, signal/deadline/attribution, отказ unsupported effort до HTTP, SDK retries 0, без собственных inference retries; scoped fetch отклоняет другой origin и опасные redirects. [FR-004, FR-009, FR-010]
- [x] T010 [US1] Реализовать в `src/adapter.js` регистрацию только при enabled, разрешённой обязательной identity и выбранной пригодной модели; auth=none допускается, при неготовности использовать replace([]) только существующего handle, не создавать пустую initial registration, не перезаписывать чужого владельца. [FR-007, FR-008, FR-014]
- [x] T011 [US1] Подключить в `src/index.js` authenticated state/command и переходный `/api/cliproxyapi/catalog` по `contracts/gateway.md`, generation guard, credential/reference-updated и record-updated, перепроверку readiness при ошибке resolve; не обещать мгновенную реакцию на внешнее env без события. [FR-001–FR-005, FR-008, FR-014]
- [x] T012 [US1] Перевести `client.js` на один полный save draft с selectionChanges и раздельный save-selection, preview и refresh, conflict/UNKNOWN reconciliation, отсутствие localhost fallback, видимое различие saved и activation error; сохранить текущие поиск, массовые действия и metadata. [FR-001, FR-002, FR-005, FR-006]
- [x] T013 [US1] Дополнить `test/index.test.js`, `test/client.test.js`, `test/adapter.test.js` и `test/transport.test.js` контрактами всех операций, полным draft, безопасностью endpoint/key, прежним prepared snapshot, отсутствующим key, auth=none, нулём моделей, native onboarding, tools/schemas, efforts, abort, image/replay и retries. [FR-001–FR-010, FR-014]

## Phase 4: User Story 2 - Перенос и восстановление (Priority: P1)

**Goal**: безопасный перенос существующего пользователя без второго владельца и потери актуального состояния.
**Independent Test**: импорт legacy profile, перезапуск и продолжение сессии; авария после unset, конфликт и откат.

- [x] T014 [US2] Реализовать `src/migration.js`: candidate и non-secret backup с точными legacy path/revision/fingerprint, provenance=legacy, сохранением selections/efforts/defaults/headers/compat/retry и блокировкой непереносимых полей, чужого/base-owned или неоднозначного маршрута, отсутствующего URL и новых own настроек. [FR-011]
- [x] T015 [US2] Реализовать в `src/migration.js` prepared → cutover intent → CAS-unset только user-layer `providers.CLIProxyAPI` → readback исчезновения legacy registration → native registration → active; не вызывать generic removeProviderProfile, допускать краткий NO_ADAPTER без скрытого retry. [FR-011, FR-012]
- [x] T016 [US2] Реализовать в `src/migration.js` recovery после каждой фазы и rollback только в отсутствующий legacy path с актуальным CAS после снятия своего route; при новых настройках переносить их либо forward repair, при конфликте не затирать данные; повторная legacy запись — конфликт. [FR-012]
- [x] T017 [US2] Интегрировать import и восстановление в `src/index.js` и `client.js`, сохранить legacy route до явного импорта/сохранения и исключить runtime generic profile sync после cutover. [FR-011, FR-012]
- [x] T018 [US2] Добавить в `test/migration.test.js` и `test/index.test.js` проверки существующей сессии, слоёв, непереносимых полей, competing CAS, падения после unset, restart, rollback до/после изменений и повторного появления legacy. [FR-011, FR-012]

## Phase 5: User Story 3 - Модели и диагностика (Priority: P2)

**Goal**: понятные состояния и единое управление через настройки CPA.
**Independent Test**: all-off, восстановление, отказ refresh и переход из Models в Plugins → CPA.

- [x] T019 [US3] Реализовать в `src/transport.js` bounded runtime ring с размерами/количествами, стадией, HTTP status и коррелируемыми request IDs без prompts, tool bodies, Authorization/cookies; различать no delivery, HTTP, SSE, incomplete/empty, abort/timeout. [FR-010]
- [x] T020 [US3] Реализовать в `client.js` состояния not-configured, disabled, missing-credential, catalog-loading, ready/stale, reconfiguring и error, предупреждение HTTP, явные disconnect/forget-key и сохранение конфигурации при отключении. [FR-007, FR-014, FR-015]
- [x] T021 [US3] Добавить в `client.js` публичный `settings.models.footer` с безопасным статусом и переходом в настройки CPA без generic mutation; не выдавать его за owner-controlled строку. [FR-013]
- [x] T022 [US3] Обновить все `locale/en.json`, `locale/ru.json`, `locale/zh.json` и `details/en.md`, `details/ru.md`, `details/zh.md` для новых состояний и сохранённых функций. [FR-006, FR-014, FR-015]
- [x] T023 [US3] Добавить в `test/client.test.js`, `test/transport.test.js` проверки состояний, безопасного текста и footer, диагностики и отсутствия секретов; проверить доступность существующих языков. [FR-006, FR-010, FR-013–FR-015]

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T024 Обновить `README.md` и `README_EN.md`: настройка, перенос, ограничение Models, риски HTTP, отключение и восстановление без обещания полной строки. [FR-004, FR-011–FR-015]
- [x] T025 Выполнить `npm run check` и проверки зависимостей SDK 1.3/1.5; записать реальные команды и результаты в `specs/001-cpa-gateway/quickstart.md`, без фиктивных успехов. [SC-002–SC-006]
- [x] T026 Выполнить изолированную установленную DSH-проверку по `specs/001-cpa-gateway/quickstart.md`: новый запуск, legacy import, сохранённая сессия, CAS/UNKNOWN, восстановление, состояние onboarding и один ограниченный существующий CPA-вызов с исходными tools без выполнения возвращённых вызовов; зафиксировать evidence и границы. [SC-001–SC-006]
- [x] T027 Проверить полноту пользовательских изменений и сохранение функциональности 0.3.1 в `README.md`, `README_EN.md`, `specs/001-cpa-gateway/quickstart.md`; выполнить итоговые analyze и применимый `speckit.converge` по установленным командам, устранить существенные расхождения. Отдельно указать, что наблюдение пользовательского Desktop и доставка требуют своего доказательства. [FR-006, FR-009, SC-001]

## Dependencies & Execution Order

T002 (test-only → root RED) → T001 → foundation T003–T007 → US1 T008–T013 → US2 T014–T018 → US3 T019–T023 → T024–T027. Тестовые T007, T013, T018 и T023 подготавливаются перед соответствующим поведением; положение записи в фазе не разрешает откладывать проверяемый контракт до конца реализации. US2 использует готовые поколения и route US1; US3 зависит от работающих состояний US1 и не должен перезаписать незавершённый migration integration. T026 зависит от T025 и установленного продукта. S1 для существующих пользователей включает US1 и US2; полный выпуск требует всех историй и доказательств, не только MVP.

### Parallel Opportunities

Без `[P]`: последовательность выбрана из-за общих `src/index.js`, `client.js` и тестов. После фиксации контрактов возможны независимые read-only исследования, но не параллельные записи одних файлов. Перенос и клиент не объявлены независимыми.

## Implementation Strategy

Сначала foundation и US1, затем миграция US2; после этого диагностика/footer US3. Каждый срез проверять своими сценариями; доказательство установленного runtime и ограниченного CPA вызова обязательно для S1. Полноценная строка Models не входит в задачи и требует отдельного решения владельца DSH.
