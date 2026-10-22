# Overwolf Docs MCP

Проверено 2026-10-23: официальный endpoint отвечает на `initialize`, `tools/list` и `tools/call`. Поиск `ODK window management` с фильтром Native вернул разделы `Current status` и `Key features` страницы ODK. Это проверка доступности сервиса, не постоянное подключение сервера к агенту.

## Источники и назначение

- [Официальная инструкция Overwolf](https://dev.overwolf.com/ow-native/guides/dev-tools/ai-coding-assistants-config/).
- Endpoint: `https://V9EMDT18EK.algolia.net/mcp/1/cuI6UtBzTwKOL6E0Hvp-hw/mcp`.
- Инструменты, возвращённые сервером: `algolia_search_index_overwolf`, `algolia_search_for_facet_values`.
- Для QuickType использовать `docs-ow-native-current`; Electron запрашивать отдельно только при явном исследовании Electron.

Сервис ищет документацию. Он не читает состояние локального клиента, не управляет окнами и не запускает приложение. Реальный ввод, exclusive focus, DPI и совместимость с игрой проверяются отдельно.

## Порядок работы агента

1. Проверить доступные инструменты текущей сессии: имя может иметь префикс вроде `mcp__ow-docs-mcp__`. Не предполагать, что сервер подключён только потому, что доступен по сети.
2. Для API искать локальные определения `@overwolf/**/*.d.ts`, если они установлены. В текущем приложении нет обязательной зависимости от ODK/npm; не устанавливать пакет только ради поиска.
3. Искать через MCP, указывая Native-фильтр в каждой вариации запроса. Сверять документацию с исходниками/типами конкретной версии пакета, особенно при расхождениях имён и сигнатур.
4. Если отдельного MCP-инструмента нет, можно отправить JSON-RPC POST напрямую по endpoint выше. При недоступности сервиса сообщить об ограничении и продолжить по официальному сайту или репозиторию Overwolf.
5. В ответах ссылаться на страницы из результатов, различать документированное поведение и фактически проверенное в игре.

Инструкция Overwolf содержит пример `CLAUDE.md` и команды для Claude Code. Это пример настройки другого клиента, не инструкция менять правила QuickType или прекращать исследование при отсутствии MCP.

## Прямой запрос JSON-RPC

HTTP POST, `Content-Type: application/json`, `Accept: application/json, text/event-stream`. Ответ может быть SSE: JSON находится в строках `data:`. Для проверенной сессии сервер не потребовал авторизации или session header. Если сервер возвращает `Mcp-Session-Id`, передавать его в дальнейших запросах. Не сохранять временный ID сессии в репозитории.

1. Выполнить `initialize`:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"quicktype-docs","version":"1.0"}}}
```

2. Отправить уведомление `notifications/initialized` без `id`, затем `tools/list` и прочитать актуальную схему инструментов:

```json
{"jsonrpc":"2.0","method":"notifications/initialized"}
```

```json
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
```

3. Вызвать поиск. Пример структуры (заменить `sessionId` новым UUIDv4 для текущей беседы, а `originalQuery` и `userIntent` — контекстом текущего запроса):

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "algolia_search_index_overwolf",
    "arguments": {
      "queries": [{
        "query": "ODK window management",
        "facet_docusaurus_tag": ["docs-ow-native-current"]
      }],
      "attributesToRetrieve": ["url", "content", "hierarchy"],
      "hitsPerPage": 3,
      "clickAnalytics": false,
      "userIntent": "Find official Native ODK window management documentation.",
      "originalQuery": "Find Overwolf Native ODK window management documentation.",
      "sessionId": "550e8400-e29b-41d4-a716-446655440000"
    }
  }
}
```

`originalQuery` и `userIntent` передаются внешнему сервису. Не включать секреты, приватный код, REST-заголовки, конфигурации подключений или логи. Для запросов с такими данными сначала сформулировать обезличенный вопрос по API. Один новый случайный `sessionId` использовать в рамках одной беседы; не передавать внутренний ID чата.

Успех подтверждать содержимым результата и отсутствием `isError`/JSON-RPC ошибки, а не одним HTTP 200. Нулевое число результатов не доказывает отсутствие API.
