# Дорожная карта TTSBard Overwolf Overlay

Этот раздел описывает направления развития оверлея. Элементы дорожной карты распределены по каталогам в зависимости от фактического состояния:

- [`active/`](./active/) — исследуемые (`exploring`), запланированные (`planned`), выполняемые (`in_progress`) и отложенные (`deferred`) направления;
- [`completed/`](./completed/) — завершённые (`completed`, `superseded`) направления с полезным `Outcome`;
- [`rejected/`](./rejected/) — осознанно отклонённые (`rejected`, `superseded`) направления с обоснованием и разделом `Reconsider when`.

## Формат roadmap item

Каждый item начинается с canonical YAML front matter:

```yaml
---
id: ROADMAP-001
status: in_progress
created: 2026-10-10
updated: 2026-10-10
related_tasks: ["TASK-001"]
---
```

Номер в `id` строго совпадает с трёхзначным префиксом имени файла (`001-*.md`).

## Активные направления

*(Нет)*

## Завершённые направления

- [ROADMAP-002: Упрощение формы подключения](./completed/002-connection-editor.md) — `completed`
- [ROADMAP-003: Обмен подключениями через JSON](./completed/003-connection-json.md) — `completed`

- [ROADMAP-001: Универсальный REST Overlay для Overwolf App Store](./completed/001-universal-rest-overlay.md) — `completed` (релиз 0.3.0)

## Отклонённые направления

*(Нет)*
