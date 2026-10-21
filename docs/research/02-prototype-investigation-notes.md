# Заметки по прототипу Overwolf-обёртки

Обновлено: 2026-10-10.

Исторический отчёт о прототипе 0.1.x. Описанное ниже мгновенное закрытие по Enter не относится к текущему QuickType: актуальная отправка ожидает HTTP-ответ. См. [README](../../README.md) и оговорки о воспроизводимости в конце этого документа.

## Раунд 2: Валидация механики окна и фокуса (0.1.9 -> 0.1.10) — УСПЕШНО ЗАВЕРШЁН (РЕШЕНО)

**Итоговый статус:** Механика окна полностью отработана и подтверждена живым тестированием (2026-10-10 15:39).
- Окно открывается по хоткею `Ctrl+Shift+F9`.
- Ввод сразу перехватывается в поле без клика мыши (`input #3..#7`).
- Одиночный `Enter` мгновенно скрывает окно (`minimize`) и возвращает ввод игре.
- Зависимость от Steam Overlay полностью устранена.

### 🔴 Главный прорыв и корневая причина (Root Cause):
Анализ внутреннего лога инжектора Overwolf (`Cult Of The Lamb_*.Game.html`) и декомпиляция C++ DLL (`OWClient.dll`, `OverWolf.BL.Interfaces.dll`, `OverWolf.Client.BL.dll`) выявили:
1. **Блокировка Exclusive Mode ядром Overwolf:**
   При открытии оверлея Overwolf пишет в C++ лог:
   `OverlayManager::SetExclusiveMode: skip exclusive mode request -> game is in mixmode`
   `Auto changing OCM to MIXED [mixmod 1] - Game cursor is not visible, ignore.`
2. **Механика тупика:**
   Overwolf по умолчанию определяет *Cult of the Lamb* как `mixmode` (смешанный режим курсора). В `mixmode` Overwolf **сознательно блокирует переход в Exclusive Mode**, ожидая кликов мышью. Но в игре аппаратный курсор скрыт (`Game cursor is not visible`), из-за чего ни мышь не активна, ни клавиатурный хук не переключается.
3. **Решение в базе Overwolf (`GamesList.8963668.xml`):**
   В файтингах и играх без курсора (например, `TEKKEN 7`) Overwolf явно прописывает:
   - `<ControlModes>NotAllowMixedMode</ControlModes>`
   - `<Client_GameControlMode>MixedNotAvailable</Client_GameControlMode>`
   - `<DisableSmartMixMode>True</DisableSmartMixMode>`
   Для *Cult of the Lamb* эти теги отсутствовали. Мы внесли их в локальный кэш Overwolf `GamesList.8963668.xml`.
4. **Улучшения в коде расширения (0.1.10):**
   - В `manifest.json`: `action-type: "custom"` (устранен конфликт со стандартным тогл-обработчиком).
   - В `background.html`: добавлен прямой вызов `overwolf.windows.bringToFront(id, true)` перед `requestOverlayFocus`.

### Валидация ключевых пунктов:
1. **Эксклюзивный мод при открытии vs Steam overlay (РЕШЕНО):**
   - Проблема была не в самом Steam, а в том, что Overwolf из-за `MixMode` сбрасывал `SetExclusiveMode`.
   - Steam Overlay при `Shift+Tab` вызывал `AttachThreadInput` / переключение окон Windows, что случайно «пробивало» фокус.
   - С отключением `SmartMixMode` (`<DisableSmartMixMode>True</DisableSmartMixMode>`) Overwolf включает `ExclusiveMode` **начисто**, без вызова Steam Overlay.
2. **Эксклюзивный мод необходим:**
   - Подтверждено документацией и кодом: Standard Overlay только рисует поверх кадра,
     но не перехватывает клавиатурный ввод в играх без курсора.
     Ввод возможен исключительно через Exclusive Mode.
3. **Автоматизация в продакшене (3 пути):**
   - **Скрипт автопатчинга:** [`scripts/patch-overwolf-gamelist.js`](../../scripts/patch-overwolf-gamelist.js) добавлен в репозиторий. Автоматический запуск в Skald / TTSBard не реализован; текущая утилита запускается вручную.
   - **Запрос в Overwolf:** Отправка тикета разработчикам Overwolf для внесения тегов в облачную мастер-базу `GamesList.xml`.
   - **Альтернатива (Native Windows TopMost):** Для безрамочных игр — использование `native_window: true`, не зависящего от GamesList.
4. **Фокус при открытии и закрытие по Enter (реализовано в 0.1.9):**
   - **Фокус сразу:** `restore` → `requestOverlayFocus` → IPC `sendMessage('focus_input_field')`
     → `field.focus()` в DOM (плюс дублирующие слушатели `window.focus` и `visibilitychange`).
   - **Enter:** `keydown` на поле перехватывает одиночный Enter (с фильтрацией `Shift+Enter`,
     IME-композиции `keyCode 229`/`isComposing`, модификаторов и `event.repeat`),
     шлёт IPC `hide_input_form` в background → `overwolf.windows.minimize(id)`.
   - **Возврат управления:** `minimize` переводит окно в скрытое состояние, срабатывает
     `ReleaseOnHidden`, Exclusive Mode сбрасывается, управление возвращается игре.
   - **Сохранение текста:** при `minimize` DOM страницы не уничтожается, текст сохраняется.

См. подробнее: [полный отчёт декомпиляции ядра Overwolf](./01-overwolf-engine-mixmode-analysis.md).

## Область применимости и воспроизводимость (2026-10-11)

Это исторические наблюдения для указанной версии клиента и игры, а не гарантия поведения всех игр. Адреса функций и смещения относятся к исследованным бинарникам. Их хеши, команды инструментов и полные обезличенные логи в отслеживаемых материалах отсутствуют; независимая верификация этих деталей пока невозможна. Для повторения исследования следует приложить эти артефакты и точные версии инструментов.

Патчер GamesList — отдельная ручная диагностическая утилита, приложение не запускает его автоматически. Перед явным запуском закройте Overwolf; исходный файл сохраняется в .bak. Обновление клиента может заменить локальный кэш. Продакшен-решение требует согласования с Overwolf, а не автоматического изменения пользовательского клиента.
