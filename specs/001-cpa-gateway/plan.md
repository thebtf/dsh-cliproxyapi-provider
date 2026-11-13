# Implementation Plan: Самостоятельное подключение CPA

**Branch**: `001-cpa-gateway` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: `specs/001-cpa-gateway/spec.md`; согласованный HOW: `.agent/design/cpa-gateway.md`.

## Summary

Собственный namespace подключения и неизменяемые поколения native-маршрута заменяют зависимость от generic profile. Публичный адаптер DSH и обёртка Responses сохраняют штатные преобразования. Перенос идёт expand → migrate → contract; безопасный footer ведёт в настройки CPA. Полная owner-controlled строка Models остаётся отдельным integration gap.

## Technical Context

**Language/Version**: JavaScript ES modules, Node.js >=24.9.0 по фактическому engines опубликованного DSH 0.2.2-rc.1; базовый пакет 0.3.1, целевой minor-релиз 0.4.0.

**Primary Dependencies**: публичные `@deepseek-ai/dsh-llm-pi-ai`, DSH Settings/Credentials/HomePaths и `@earendil-works/pi-ai`; прямые зависимости и lockfile, совместимый с DSH диапазон SDK, проверки нижней 1.3 и текущей 1.5.

**Storage**: Settings namespace `llm-cliproxyapi` с CAS; credentials отдельно; host cache last-good через `dshCachePath`, не `ctx.fs`.

**Testing**: `node --test`, `npm run check`, contract/unit/integration; установленный пакет в изолированном DSH-профиле и один ограниченный реальный вызов CPA — отдельные доказательства, не выполненные сейчас.

**Target Platform**: локальный DSH/desktop и его web settings; Node >=24.9.0. Обычные проверки выполняются в локальном Node24 Docker; поддерживаемые SDK 1.3/1.5 проверяются отдельно.

**Project Type**: DSH-плагин с клиентской формой и host-командами.

**Performance Goals**: новых числовых целей нет; существующий bounded backoff каталога сохраняется.

**Constraints**: каталог upstream до 4 MiB, нормализованный cache до 8 MiB; SDK inference retries 0; без sidecar, скрытых inference retries и приватных импортов.

**Scale/Scope**: одно подключение, существующие сессии и все существующие языки; полноценная управляемая строка Models вне объёма.

## Constitution Check

До и после проектирования: I — совместимость и явные изменения FR-007/013; II — привязка ключа, секрет отдельно, безопасная диагностика; III — CAS, operationId и восстановление; IV — только доказанные публичные интерфейсы и безопасный footer; V — требуются установочный и реальный ограниченный вызов, не только unit tests. Противоречий в проекте не выявлено; фактическое соответствие реализации ещё не проверено.

## Project Structure

### Documentation (this feature)

`specs/001-cpa-gateway/`: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `tasks.md`, `checklists/`, `analysis.md`.

### Source Code (repository root)

- `src/index.js`: сборка, команды и регистрация.
- `src/catalog.js`: нормализация; новые `src/catalog-store.js`, `src/connection.js`, `src/adapter.js`, `src/transport.js`, `src/migration.js` — запланированные границы поведения.
- `client.js`, `locale/`, `details/`: существующий интерфейс и переводы.
- `test/index.test.js`, `test/catalog.test.js`, `test/client.test.js`, новые целевые файлы в `test/`.
- `package.json`, `package-lock.json`: прямые зависимости и lock.

**Structure Decision**: сохранить существующий пакет и переиспользовать клиент и нормализацию; отдельные модули только для перечисленных различимых обязанностей.

## Complexity Tracking

Исключений из конституции не требуется. Нет нового сервера или универсального фреймворка. Согласованная схема и детали ограничений: [data-model.md](data-model.md), [contracts](contracts/gateway.md), [research.md](research.md).
