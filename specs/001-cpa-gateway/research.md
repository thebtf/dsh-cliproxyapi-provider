# Основания решений

Источники и пробы уже проверены в `.agent/design/cpa-gateway.md` 2026-11-10–11 UTC; здесь повторно используется их ограниченное покрытие, а не объявляется новая проверка.

## Маршрут и транспорт

**Решение**: публичный `PiAiAdapter`, собственный pi-ai Provider/Responses wrapper, immutable snapshot. **Причина**: штатные преобразования истории и потоков с контролем payload и response. **Альтернативы**: generic profile оставляет двойное владение; собственные конвертеры и sidecar создают лишнюю сложность. Публичный seam подтверждён synthetic probe на pi-ai 1.3.0; он не подтверждает image/replay parity. Прямая зависимость и диапазон, совместимый с DSH, обязательны; проверить 1.3 и 1.5 при реализации.

## Настройки, ключи и cache

**Решение**: Settings CAS, owner-scoped immutable credential records или внешняя reference, ограниченный host cache. **Причина**: межпространственной транзакции нет, поэтому секрет подготавливается до CAS и состояние операции сверяется при UNKNOWN. **Альтернатива**: несколько независимых записей формы допускают частичный успех. `unset(ref)` не доказывает отсутствие ключа из-за ambient fallback.

## Перенос

**Решение**: подготовка, intent, CAS удаления только legacy user-layer, readback исчезновения старого владельца, регистрация нового, recovery по состоянию. **Причина**: два владельца одного ID недопустимы и общей транзакции нет. **Альтернатива**: одновременная регистрация и молчаливый retry создают конфликт или скрывают разрыв.

## Models

**Решение**: native picker и публичный `settings.models.footer`, настройки в Plugins → CPA. **Причина**: [`provider-card` — дополнение, не замена штатных действий](https://github.com/deepseek-ai/deepseek-harness/blob/HEAD/packages/client/ui-settings-models/src/client/slot-contract.ts), источник прочитан 2026-11-10 UTC. **Альтернативы**: фиктивный generic profile, DOM patch и замена всего экрана не приняты. Owner-controlled card/action seam не доказан и остаётся отдельным gap.

## Источники

- [OMP models documentation](https://github.com/can1357/oh-my-pi/blob/main/docs/models.md), прочитано 2026-11-10 UTC: разделение регистрации, credentials, каталога и доступности; не инструкция копировать реализацию.
- `.agent/design/cpa-gateway.md` §§2, 9–10: публичные типы DSH 0.2.2-rc.1, synthetic stream probe и strict 0.3.1 wire proof; не покрывают перенос, lifecycle ключей или image/replay parity.
