# QuickType (Overwolf)

An in-game app for entering text and integrating with apps and services through APIs.
Внутриигровое приложение для ввода текста и интеграции с приложениями и сервисами через API.

**[English](#english) | [На русском](#русский)**

## English

QuickType is an in-game app for entering text and integrating with apps and services through APIs. Type directly in-game and send your text through a configured integration without switching away from your game or getting distracted by other windows.

Configure integrations through REST APIs and webhooks: send messages, pass text to bots or trigger actions in compatible automation services. Customize the destination, request format and input appearance for your workflow.

For example, connect a text-to-speech (TTS) application to read typed phrases aloud while gaming. This can help players who cannot use their voice. Speech synthesis and audio routing to other players depend on the chosen service and the user's setup. QuickType does not require a specific companion application.

---

### How it works for players

The overlay lets you enter text without leaving the game:

1. **Set up a hotkey once:**
   Choose a hotkey in Overwolf settings (default: `Ctrl+T`).
   If your game uses the same combination, choose another hotkey. After updating QuickType, check the active binding in Overwolf settings and set `Ctrl+T` if you want to use the new default.
2. **Press the hotkey while playing:**
   The game **does not pause**. A compact, dimmed input window appears over the game, with the text field already focused. Start typing immediately without clicking.
3. **Send or dismiss:**
   * **Enter** sends the text through your configured integration. With the default settings, the window closes after a successful HTTP response and returns control to the game.
   * **Shift+Enter** inserts a line break for multiline text.
   * **Esc** closes the window if you change your mind.
4. **If sending fails:**
   If the server is unavailable or a network error occurs, the window **stays open**, and your text is preserved. An error message appears below the input field so you can edit the text or try again.

---

### Application windows

QuickType has two visible windows. The input overlay is the main window and opens by default; settings open separately using its ⚙ button.

1. **Main input window (Overlay):**
   * Launching QuickType or clicking its icon in the Overwolf hub opens the input window. It is available on the desktop and over games; the hotkey (default: `Ctrl+T`) shows or hides it in-game.
   * Large text (18 px by default), configurable font family and size, and contrasting controls for dark and light backgrounds.
   * Settings automatically load installed font families when opened. This requires Local Font Access API support and permission in the browser engine; if first access requires a click, opening the font list retries the request. If unavailable or denied, the built-in list remains available. A selected system font is previewed immediately and saved with Save; it remains selected after reopening settings.
   * A compact initial height of 100 px for short messages, with automatic height adjustment for multiline text.
   * A single focus border without duplicate outlines.
   * Keyboard hints for Enter (send) and Esc (close).
2. **Additional settings window (Desktop):**
   * Open it on the desktop using the ⚙ button next to the input field.
   * Two tabs: Connection («Подключение») for the method, URL, and speech test; and Overlay («Оверлей») for geometry, appearance, and behavior. Change the hotkey in Overwolf settings.
   * The application interface is in English. Documentation is available in English and Russian.
   * Import and export connections as JSON using file selection, drag-and-drop, or pasted text. Profiles exclude overlay appearance settings. See the [connection sharing guide](./docs/en/user/connection-json.md).
   * Configure the HTTP method (POST, GET, PUT), request body template (`{"text": "{text}"}`), and headers. The body template and headers are in the advanced request options.
   * Test speech using Send («Отправить»), with a service acceptance indicator and HTTP response details.
   * Appearance changes immediately update the open input window. Settings include a background color palette and a geometry reset to 640×100. The desktop theme follows the system by default; the ☀/☾ button switches between light and dark and saves the choice independently of overlay appearance.
   * Behavior settings explain draft preservation when closing with Escape and text clearing.

The manifest starts a hidden background controller (`background.html`). It opens the input overlay at startup and when QuickType is launched from the Overwolf hub, handles the toggle hotkey, and opens the settings window on the overlay's `open_settings` message. The settings window is not shown automatically.

---

### Operating modes

* **Current: Exclusive Focus**
  Pressing the hotkey shows the overlay and immediately gives keyboard focus to the input field.
  * **Enter** sends the text and waits for a response. An HTTP 2xx response immediately clears the field if clearing is enabled, then closes the window after 350 ms if closing after submission is enabled. No separate success message is displayed. On failure, the text remains available for editing and retrying.
  * **Shift+Enter** inserts a line break.
  * **Escape** hides the window if the corresponding setting is enabled. The draft is preserved until a successful send. The hotkey also hides the window. A late response from a hidden session does not change newly entered text; a request already sent may still be processed by the server.
* **Possible future development: Pinned / Click-to-focus**
  The idea is to keep the input field visible over the game and activate keyboard focus on click. This mode is not implemented or included in the current release plan.

---

### Game compatibility and mode detection

Overwolf detects games and their graphics context using its internal `GamesList.xml` database. Some games are detected incorrectly or use display modes with specific behavior, such as Exclusive Fullscreen, Borderless, no system cursor, or MixMode.

In these games, the overlay may fail to capture input focus or appear until the correct overlay mode is explicitly configured for that game in Overwolf.

Resources for troubleshooting:

* Manual game configuration diagnostic tool: [scripts/patch-overwolf-gamelist.js](./scripts/patch-overwolf-gamelist.js). QuickType does not run it automatically; a supported profile change should be discussed with Overwolf.
* Detailed technical analysis (in Russian): [MixMode architecture and input capture](./docs/research/01-overwolf-engine-mixmode-analysis.md).

---

### Known limitations

#### Focus loss when switching input languages

In some games, switching the input language (keyboard layout) while the overlay window is open may cause keyboard focus to be lost. This behavior depends on the game: in other games, switching input languages works normally. There is currently no solution for affected games.

**Workaround:**

1. Hide the overlay using its toggle hotkey.
2. Switch the input language.
3. Show the overlay again using the hotkey and continue typing.

---

### Hiding the overlay in OBS Studio

To check whether the overlay can be hidden from OBS:

1. Use a **Game Capture** source in OBS Studio.
2. Disable **Capture third-party overlays (such as steam)** in the source properties.
3. Make a short local recording while opening the overlay and entering test text. Review the recording: whether the overlay is excluded depends on the game, graphics API, and hook order. This setting alone does not guarantee exclusion.

Detailed capture mode comparison (in Russian): [Overlay capture and hiding in OBS Studio](./docs/research/03-obs-overlay-capture.md).

---

### Installation: Developer Mode required

The application is under development and is installed as an unpacked extension. Your Overwolf account must have Developer Mode enabled:

* Apply through the Overwolf developer portal.
* Complete the current application form with accurate information. Overwolf grants access after reviewing it.

Instructions: [Getting Developer Mode in Overwolf](./docs/en/user/developer-mode.md).

---

### Quick start

1. **Get the application files:**
   * Download and extract an archive from [Releases](https://github.com/ttsbard/quicktype-overwolf/releases).
   * Or clone the repository:
     ```bash
     git clone https://github.com/ttsbard/quicktype-overwolf.git
     ```
2. **Load the extension in Overwolf:**
   * Open Overwolf → **Settings** → **Development Options**.
   * Click **Load unpacked extension** and select the [`quicktype-overlay`](./quicktype-overlay) folder.
3. **Configure the integration:**
   * Click ⚙ in the input window and enter your REST API URL (for example, `http://localhost:5000/tts`) or webhook URL.
   * Test the connection with Send («Отправить») in the speech test section («Проверка озвучивания»).
   * Click Save («Сохранить») so the overlay uses this connection.
4. **Use it in-game:**
   * Launch a game.
   * Press `Ctrl+T` (you can change this in Overwolf hotkey settings).
   * Type your text and press **Enter**, or **Shift+Enter** for a line break. By default, the window closes after a successful HTTP 2xx response. If sending fails, resolve the issue and retry.

### Integration and request configuration

The service URL is empty by default, and the default method is **POST**. Choose a compatible local or remote service and configure its URL, method, headers and request body according to its API. Save the connection and test sending text before using it in-game. An HTTP 2xx response confirms that the service accepted the request; it does not confirm speech playback or delivery to other players.

#### Example: TTSBard

[TTSBard](https://github.com/ttsbard/TTSBard) is one optional text-to-speech integration. For a local instance, configure:

* **URL:** `http://127.0.0.1:10101/v1/speech`
* **Method:** `POST`
* **Headers:** `Content-Type: application/json`
* **Request body:** `{"text": "{text}"}`

Save the service URL in settings and start TTSBard before sending text.

#### Custom REST APIs and webhooks

QuickType can send text to compatible HTTP APIs and webhook endpoints, including bots and automation services. Match the request format and authentication to the receiving service:

* **JSON:** Place the `{text}` placeholder inside a string value in the template (for example, `{"message": "{text}"}`). The text is automatically escaped as a valid JSON string.
* **Plain text:** With `text/plain`, the `{text}` placeholder in the template is replaced without JSON escaping. Use `{text}` as the entire template to send only the message. Leading and trailing whitespace is trimmed when submitting from the overlay. The template engine does not perform form-urlencoded encoding.
* **Headers:** Provide a JSON object with string values, such as an `Authorization: Bearer ...` token.
* **GET:** The `{text}` placeholder in the URL is replaced with URL-encoded text. If the URL has no placeholder, a `text` query parameter is appended while preserving existing parameters.
* **Timeouts and reliability:** Requests time out after 15 seconds. There are no automatic retries. On error or timeout, the text remains in the overlay for manual editing or retrying.

#### Overlay appearance and geometry

Configure the background color, opacity, and keyboard hints in the settings window using the palette and presets. Changes immediately appear in the open overlay. Click Save («Сохранить») to preserve settings across Overwolf restarts.

Adjust the overlay position and size in-game:

* Move it by dragging the overlay's top bar.
* Resize by dragging the edges or corners; verify this behavior manually in your game.
* Automatic height adjustment works until manual geometry is saved. Use Reset window («Сбросить окно») to enable it again.
* Window geometry is saved automatically, independently of network settings. Reset window («Сбросить окно») restores the default size of 640×100 and position of 100×100.

Sources are loaded directly from `quicktype-overlay/`. After editing, manually reload the extension in Development Options. Distribution archives are built only on explicit request. Checks and manual test scenarios are described in the [development documentation](./docs/development/README.md) (in Russian).

### Support

Report issues or suggest integrations through [GitHub Issues](https://github.com/ttsbard/quicktype-overwolf/issues). Include the game, display mode and steps to reproduce. Remove access tokens and other private connection details before sharing settings or logs.

---

## Русский

QuickType — внутриигровое приложение для ввода текста и интеграции с приложениями и сервисами через API. Вводите текст прямо в игре и отправляйте его через настроенную интеграцию, не отвлекаясь на другие окна и не переключаясь из игры.

Настраивайте интеграции через REST API и webhooks: передавайте сообщения, отправляйте текст ботам или запускайте действия в совместимых сервисах автоматизации. Выбирайте адрес, формат запроса и внешний вид поля под свой сценарий.

Например, подключите программу синтеза речи (TTS), чтобы озвучивать набранные фразы во время игры. Это может помочь игрокам, которые не могут пользоваться голосом. Озвучивание и передачу звука собеседникам обеспечивают выбранный сервис и настройки пользователя. QuickType не требует конкретного приложения-компаньона.

---

### Как это работает для игрока (Сценарий использования)

Всё взаимодействие с оверлеем сделано так, чтобы не отвлекать от геймплея и не требовать сворачивания игры (Alt+Tab):

1. **Один раз настраиваете горячую клавишу:**
   В настройках Overwolf задаётся удобный хоткей вызова оверлея (по умолчанию `Ctrl+T`).
   Если игра использует ту же комбинацию, выберите другую. После обновления QuickType проверьте текущее назначение в настройках Overwolf и задайте `Ctrl+T`, если хотите использовать новое сочетание по умолчанию.
2. **Нажимаете хоткей прямо во время игры:**
   Игра **не ставится на паузу** — поверх игры появляется компактное аккуратно затемнённое поле ввода, и курсор клавиатуры сразу оказывается в нём. Никаких кликов мышью делать не нужно: нажали комбинацию клавиш — и сразу печатаете.
3. **Отправка:**
   * **Enter** — отправляет текст через настроенную интеграцию. По умолчанию после успешного HTTP-ответа окно закрывается и возвращает управление игре.
   * **Shift+Enter** — переносит строку, если нужен многострочный текст.
   * **Esc** — мгновенно закрывает окно, если передумали писать.
4. **Ошибка отправки:**
   Если сервер недоступен или произошёл сбой сети, окно **не закроется**, а ваш набранный текст не пропадёт. Оверлей покажет лаконичное сообщение об ошибке прямо под полем ввода, чтобы вы могли исправить текст или повторить отправку.

---

### Как устроено приложение

У QuickType два видимых окна. Основное окно — оверлей ввода, который открывается по умолчанию; настройки вызываются отдельно его кнопкой ⚙.

1. **Основное окно ввода (Overlay):**
   * При запуске QuickType и клике по его значку в хабе открывается поле ввода. Оно доступно на рабочем столе и поверх игры; горячая клавиша (по умолчанию `Ctrl+T`) показывает или скрывает его в игре.
   * Крупный текст (по умолчанию 18 px), выбор шрифта и размера, контрастное оформление для тёмного и светлого фона.
   * Установленные семейства шрифтов загружаются автоматически при открытии настроек. Нужны поддержка Local Font Access API движком браузера и разрешение доступа; если первый запрос требует нажатия, открытие списка шрифтов повторит запрос. Если API недоступен или доступ не предоставлен, остаётся стандартный список. Выбранный системный шрифт сразу виден в предпросмотре, сохраняется кнопкой «Сохранить» и восстанавливается при повторном открытии настроек.
   * Компактная начальная высота (100 px для коротких реплик) с автоматическим увеличением высоты при многострочном вводе.
   * Единая спокойная рамка фокуса без дублирующих контуров.
   * Подсказки по клавишам: «Enter — Отправить · Esc — Закрыть».
2. **Дополнительное окно настроек (Desktop):**
   * Открывается на рабочем столе кнопкой ⚙ рядом с полем ввода.
   * Две вкладки: «Подключение» (метод, адрес, проверка озвучивания) и «Оверлей» (геометрия, оформление, поведение). Горячая клавиша переназначается в настройках Overwolf.
   * Интерфейс приложения — на английском. Документация доступна на английском и русском.
   * Подключение: HTTP-метод (POST, GET, PUT) и адрес сервиса; шаблон тела запроса (`{"text": "{text}"}`) и заголовки раскрываются в блоке дополнительных параметров.
   * Импорт и экспорт подключения через JSON: выбор файла, перетаскивание или вставка текста; оформление оверлея в профиль не входит. [Подробнее об обмене подключениями](./docs/ru/user/connection-json.md).
   * Проверка озвучивания: кнопка «Отправить» с индикацией «Сервис принял текст» и HTTP-ответом.
   * Изменения оформления сразу видны в открытом окне ввода; палитра цветов фона и сброс геометрии к 640×100. Тема окна настроек по умолчанию следует системе; кнопка ☀/☾ переключает светлую и тёмную темы и сохраняет выбор независимо от оформления оверлея.
   * Понятные пояснения к параметрам поведения (сохранение черновика при закрытии по Escape и очистка).

В манифесте стартовым указан скрытый фоновый контроллер (`background.html`). Он открывает оверлей ввода при запуске приложения и вызове QuickType из хаба Overwolf, обрабатывает хоткей показа/скрытия и открывает настройки по сообщению `open_settings` от оверлея. Окно настроек автоматически не показывается.

---

### Режимы работы

* **Текущий: Эксклюзивный режим (Exclusive Focus)**
  При нажатии хоткея оверлей мгновенно появляется и сразу захватывает фокус клавиатуры в поле ввода.
  * **Enter** — отправляет текст и ожидает ответ. При HTTP 2xx сразу очищает поле, если включена очистка, а через 350 мс закрывает окно, если включено закрытие после отправки. Отдельного сообщения об успехе нет. При ошибке текст остаётся для редактирования и повтора.
  * **Shift+Enter** — перенос строки (поддерживается многострочный ввод).
  * **Escape** — скрывает окно, если включена соответствующая настройка. Черновик сохраняется до успешной отправки. Хоткей также скрывает окно. Поздний ответ скрытой сессии не меняет новый текст; уже переданный запрос может быть обработан сервером.
* **Возможное развитие: Постоянный режим (Pinned / Click-to-focus)**
  Идея второго режима — постоянно отображать поле поверх игры и активировать фокус кликом мыши. Этот режим пока не реализован и не включён в текущий план релиза.

---

### Совместимость с играми и детекция режимов

Overwolf определяет игры и тип их графического контекста по внутренней базе `GamesList.xml`. Некоторые игры детектируются некорректно или работают в специфических режимах отображения (Exclusive Fullscreen, Borderless, отсутствие системного курсора, MixMode).

В таких играх оверлей может не перехватывать фокус ввода или не отображаться, пока в конфигурации Overwolf явно не задан правильный режим работы оверлея для конкретной игры.

Материалы диагностики:

* Ручная диагностическая утилита настройки профиля игры: [scripts/patch-overwolf-gamelist.js](./scripts/patch-overwolf-gamelist.js). QuickType не запускает её автоматически; поддерживаемое изменение профиля следует обсудить с Overwolf.
* Подробный технический анализ описан в документе: [Архитектурный анализ MixMode и захвата ввода](./docs/research/01-overwolf-engine-mixmode-analysis.md).

---

### Известные ограничения

#### Потеря фокуса при переключении языка ввода

В некоторых играх при переключении языка ввода (раскладки клавиатуры), пока окно оверлея открыто, может теряться фокус клавиатуры. Поведение зависит от игры: в других играх переключение языка работает нормально. Для игр, в которых возникает эта проблема, решения пока нет.

**Обходной способ:**

1. Скройте окно оверлея горячей клавишей вызова.
2. Переключите язык ввода.
3. Снова вызовите оверлей горячей клавишей и продолжайте ввод.

---

### Как скрыть оверлей в OBS Studio

Чтобы проверить возможность скрытия оверлея в OBS:

1. В OBS Studio используйте источник **«Захват игры»** (Game Capture), а не «Захват экрана».
2. В свойствах источника снимите галочку **«Захватывать сторонние оверлеи (например, оверлей Steam)»** (Capture third-party overlays).
3. Сделайте короткую локальную запись с открытием оверлея и набором тестового текста. Проверьте результат: отсутствие оверлея зависит от игры, графического API и порядка хуков и не гарантируется одной настройкой.

Подробное руководство со сравнением режимов захвата: [Исследование захвата и скрытия оверлея в OBS Studio](./docs/research/03-obs-overlay-capture.md).

---

### Установка: Требуется Developer Mode

Приложение находится в стадии разработки и устанавливается как распакованное расширение (unpacked extension). Для этого у вашего аккаунта Overwolf должен быть включён режим разработчика (Developer Mode):
* Заявка подаётся на портале разработчиков Overwolf.
* Заполните актуальную заявку достоверными данными; доступ предоставляется Overwolf после рассмотрения.

Инструкция по получению: [Гайд по получению Developer Mode в Overwolf](./docs/ru/user/developer-mode.md).

---

### Быстрый старт

1. **Получите файлы приложения:**
   * Скачайте архив со страницы [Releases](https://github.com/ttsbard/quicktype-overwolf/releases) и распакуйте его.
   * Либо клонируйте репозиторий:
     ```bash
     git clone https://github.com/ttsbard/quicktype-overwolf.git
     ```
2. **Загрузите расширение в Overwolf:**
   * Откройте Overwolf -> **Настройки** -> **Development Options**.
   * Нажмите **Load unpacked extension** и укажите папку [`quicktype-overlay`](./quicktype-overlay).
3. **Настройте интеграцию:**
   * Нажмите ⚙ в окне ввода и укажите ваш REST API URL (например, `http://localhost:5000/tts` или вебхук).
   * Проверьте отправку кнопкой **«Отправить»** в разделе «Проверка озвучивания».
   * Нажмите **«Сохранить»**, чтобы оверлей использовал это подключение.
4. **Используйте в игре:**
   * Запустите игру.
   * Нажмите `Ctrl+T` (хоткей можно переназначить в настройках хоткеев Overwolf).
   * Наберите текст и нажмите **Enter** (или **Shift+Enter** для переноса строки). По умолчанию после успешного HTTP 2xx окно закроется. При ошибке исправьте причину и повторите запрос.

### Настройка интеграции и запросов

По умолчанию адрес сервиса пустой, метод — **POST**. Выберите совместимый локальный или удалённый сервис и задайте адрес, метод, заголовки и тело запроса согласно его API. Сохраните подключение и проверьте отправку текста до использования в игре. HTTP 2xx подтверждает принятие запроса сервисом, но не озвучивание или доставку другим игрокам.

#### Пример: TTSBard

[TTSBard](https://github.com/ttsbard/TTSBard) — один из необязательных вариантов подключения синтеза речи. Для локального экземпляра укажите:
* **URL:** `http://127.0.0.1:10101/v1/speech`
* **Метод:** `POST`
* **Заголовки:** `Content-Type: application/json`
* **Тело запроса:** `{"text": "{text}"}`

Сохраните адрес сервиса в настройках и запустите TTSBard перед отправкой текста.

#### Настройка REST API и webhooks

QuickType отправляет текст в совместимые HTTP API и webhook endpoints, включая ботов и сервисы автоматизации. Формат запроса и авторизация должны соответствовать требованиям принимающего сервиса:
* **Формат JSON:** плейсхолдер `{text}` размещается внутри строкового значения шаблона (например, `{"message": "{text}"}`) и автоматически экранируется как валидная JSON-строка.
* **Формат Plain Text:** для `text/plain` плейсхолдер `{text}` в шаблоне заменяется текстом без JSON-экранирования. Для отправки только текста задайте шаблон `{text}`. Пробелы и пустые строки по краям сообщения удаляются перед отправкой из оверлея; кодирование `form-urlencoded` шаблонизатор не выполняет.
* **Заголовки:** задаются JSON-объектом со строковыми значениями (например, авторизационные токены `Authorization: Bearer ...`).
* **Метод GET:** плейсхолдер `{text}` в URL заменяется URL-кодированным значением; если плейсхолдер в адресе не указан, добавляется query-параметр `text` с сохранением существующих параметров.
* **Таймауты и надёжность:** ожидание ответа ограничено 15 секундами. Автоматических повторов нет — при ошибке или таймауте текст остаётся в поле ввода оверлея для ручного редактирования или повторной отправки.

#### Внешний вид и геометрия оверлея

Цвет фона, непрозрачность и видимость подсказок настраиваются в отдельном окне настроек с палитрой и готовыми пресетами. Откройте его кнопкой ⚙ из окна ввода. Изменения сразу отображаются в открытом оверлее. Чтобы зафиксировать настройки между перезапусками Overwolf, нажмите кнопку **«Сохранить»**.

Положение и размер оверлея настраиваются прямо во время игры:
* Перемещение — перетаскиванием за верхнюю плашку оверлея;
* Изменение размера — перетаскиванием за грани и углы; работу в конкретной игре необходимо проверить вручную;
* Автоматический подбор высоты действует до сохранения ручной геометрии. Для возврата к нему нажмите **«Сбросить окно»**;
* Геометрия окна сохраняется автоматически и независимо от сетевых настроек. Кнопка **«Сбросить окно»** возвращает размер по умолчанию 640×100 и координаты 100×100.

Исходники загружаются напрямую из `quicktype-overlay/`. После правок выполните ручной Reload в Development Options. Архив создаётся только по отдельному запросу. Проверки и ручные сценарии описаны в [документации разработки](./docs/development/README.md).

### Поддержка

Сообщить о проблеме или предложить интеграцию можно через [GitHub Issues](https://github.com/ttsbard/quicktype-overwolf/issues). Укажите игру, режим экрана и шаги воспроизведения. Перед публикацией настроек или логов удалите токены доступа и другие личные параметры подключения.
