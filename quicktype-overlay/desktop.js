document.addEventListener('DOMContentLoaded', function () {
  // Элементы формы
  var apiUrlInput = document.getElementById('apiUrl');
  var httpMethodSelect = document.getElementById('httpMethod');
  var headersTextarea = document.getElementById('headers');
  var payloadTemplateTextarea = document.getElementById('payloadTemplate');
  // Элементы внешнего вида оверлея
  var overlayOpacityInput = document.getElementById('overlayOpacity');
  var opacityValueSpan = document.getElementById('opacityValue');
  var overlayBgColorInput = document.getElementById('overlayBgColor');
  var showHintsCheckbox = document.getElementById('showHints');
  var btnResetBounds = document.getElementById('btn-reset-bounds');

  var closeOnSubmitCheckbox = document.getElementById('closeOnSubmit');
  var clearOnSubmitCheckbox = document.getElementById('clearOnSubmit');
  var closeOnEscapeCheckbox = document.getElementById('closeOnEscape');
  var saveIndicator = document.getElementById('save-indicator');

  // Тестовые элементы
  var testInput = document.getElementById('testInput');
  var btnTestRequest = document.getElementById('btn-test-request');
  var resultBadge = document.getElementById('resultBadge');
  var resultStatusText = document.getElementById('resultStatusText');
  var testResultBox = document.getElementById('testResultBox');
  var resultBoxTitle = document.getElementById('resultBoxTitle');
  var resultBoxMeta = document.getElementById('resultBoxMeta');
  var resultBoxBody = document.getElementById('resultBoxBody');
  var btnCloseResult = document.getElementById('btn-close-result');
  var requestDetails = document.getElementById('requestDetails');
  var dirtyIndicator = document.getElementById('dirty-indicator');
  var saveButton = document.getElementById('btn-save');
  var appTheme = document.getElementById('appTheme');
  var themeToggleBtn = document.getElementById('themeToggleBtn');
  var overlayPreview = document.getElementById('overlayPreview');
  var previewHints = document.getElementById('previewHints');
  var savedForm;
  var statusTimer;
  var systemTheme = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: light)') : null;

  function readPreference(key, fallback) {
    try { return localStorage.getItem(key) || fallback; } catch (_) { return fallback; }
  }

  function writePreference(key, value) {
    try { localStorage.setItem(key, value); } catch (_) { /* The current session still works. */ }
  }

  function updateThemeButton(theme) {
    if (!themeToggleBtn) return;
    if (theme === 'dark') {
      themeToggleBtn.title = 'Переключить на светлую тему';
      themeToggleBtn.setAttribute('aria-label', 'Переключить на светлую тему');
    } else {
      themeToggleBtn.title = 'Переключить на тёмную тему';
      themeToggleBtn.setAttribute('aria-label', 'Переключить на тёмную тему');
    }
  }

  function applyTheme() {
    var rawTheme = appTheme ? appTheme.value : 'system';
    var theme = rawTheme === 'system' ? (systemTheme && systemTheme.matches ? 'light' : 'dark') : rawTheme;
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeButton(theme);
  }

  if (appTheme) {
    appTheme.value = readPreference('quicktype_desktop_theme', 'system');
    if (['system', 'dark', 'light'].indexOf(appTheme.value) === -1) appTheme.value = 'system';
    applyTheme();
    appTheme.addEventListener('change', function () {
      applyTheme();
      writePreference('quicktype_desktop_theme', appTheme.value);
    });
  } else {
    applyTheme();
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-theme') || 'dark';
      var next = current === 'dark' ? 'light' : 'dark';
      if (appTheme) {
        appTheme.value = next;
      }
      document.documentElement.setAttribute('data-theme', next);
      updateThemeButton(next);
      writePreference('quicktype_desktop_theme', next);
    });
  }

  if (systemTheme) {
    if (systemTheme.addEventListener) systemTheme.addEventListener('change', applyTheme);
    else if (systemTheme.addListener) systemTheme.addListener(applyTheme);
  }

  function selectTab(name) {
    ['connection', 'overlay'].forEach(function (tabName) {
      var active = tabName === name;
      var tab = document.getElementById('tab-' + tabName);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      document.getElementById('panel-' + tabName).hidden = !active;
    });
  }

  ['connection', 'overlay'].forEach(function (name, index) {
    var tab = document.getElementById('tab-' + name);
    tab.addEventListener('click', function () { selectTab(name); });
    tab.addEventListener('keydown', function (event) {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(event.key) === -1) return;
      event.preventDefault();
      var next = event.key === 'Home' ? 'connection' : event.key === 'End' ? 'overlay' : (index === 0 ? 'overlay' : 'connection');
      selectTab(next);
      document.getElementById('tab-' + next).focus();
    });
  });

  requestDetails.open = readPreference('quicktype_request_details', 'closed') === 'open';
  requestDetails.addEventListener('toggle', function () {
    writePreference('quicktype_request_details', requestDetails.open ? 'open' : 'closed');
  });

  // Загружаем текущий конфиг
  var currentConfig = loadOverlayConfig();
  populateForm(currentConfig);
  savedForm = JSON.stringify(readForm());
  updateSaveState();
  updatePreview();

  document.querySelectorAll('.settings-panel input, .settings-panel select, .settings-panel textarea').forEach(function (input) {
    if (input === testInput) return;
    input.addEventListener('input', updateSaveState);
    input.addEventListener('change', updateSaveState);
  });

  function updateSaveState() {
    var dirty = JSON.stringify(readForm()) !== savedForm;
    dirtyIndicator.textContent = dirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены';
    if (dirty) dirtyIndicator.classList.add('dirty');
    else dirtyIndicator.classList.remove('dirty');
    saveButton.disabled = !dirty;
  }

  function updatePreview() {
    var cfg = readForm();
    var hex = cfg.overlayBgColor.slice(1);
    var value = parseInt(hex, 16);
    overlayPreview.style.background = 'rgba(' + ((value >> 16) & 255) + ',' + ((value >> 8) & 255) + ',' + (value & 255) + ',' + cfg.overlayOpacity / 100 + ')';
    previewHints.hidden = !cfg.showHints;
    document.querySelectorAll('.theme-chip').forEach(function (chip) {
      var chipColor = chip.getAttribute('data-color');
      var chipOpacity = chip.getAttribute('data-opacity');
      var active = chipColor === cfg.overlayBgColor && (!chipOpacity || Number(chipOpacity) === cfg.overlayOpacity);
      chip.setAttribute('aria-pressed', String(active));
    });
  }

  function populateForm(cfg) {
    apiUrlInput.value = cfg.apiUrl || '';
    httpMethodSelect.value = (cfg.httpMethod || 'POST').toUpperCase();
    headersTextarea.value = cfg.headers || '';
    payloadTemplateTextarea.value = cfg.payloadTemplate || '';
    
    var opVal = cfg.overlayOpacity != null ? cfg.overlayOpacity : 90;
    overlayOpacityInput.value = opVal;
    if (opacityValueSpan) opacityValueSpan.textContent = opVal + '%';

    overlayBgColorInput.value = cfg.overlayBgColor || '#0e0e12';
    showHintsCheckbox.checked = cfg.showHints !== false;

    closeOnSubmitCheckbox.checked = cfg.closeOnSubmit !== false;
    clearOnSubmitCheckbox.checked = cfg.clearOnSubmit !== false;
    closeOnEscapeCheckbox.checked = cfg.closeOnEscape !== false;
  }

  function readForm() {
    return {
      apiUrl: apiUrlInput.value.trim(),
      httpMethod: httpMethodSelect.value,
      headers: headersTextarea.value.trim(),
      payloadTemplate: payloadTemplateTextarea.value.trim(),
      overlayOpacity: parseInt(overlayOpacityInput.value, 10) || 90,
      overlayBgColor: overlayBgColorInput.value || '#0e0e12',
      showHints: showHintsCheckbox.checked,
      closeOnSubmit: closeOnSubmitCheckbox.checked,
      clearOnSubmit: clearOnSubmitCheckbox.checked,
      closeOnEscape: closeOnEscapeCheckbox.checked
    };
  }

  var importPanel = document.getElementById('connection-import');
  var importButton = document.getElementById('btn-import-connection');
  var importText = document.getElementById('connectionJson');
  var importFile = document.getElementById('connectionFile');
  var importFileName = document.getElementById('connectionFileName');
  var filePicker = document.getElementById('connectionFilePicker');
  var transferStatus = document.getElementById('connection-transfer-status');
  var fileReadVersion = 0;
  var maxProfileSize = 1024 * 1024;

  function transferMessage(message, success) {
    transferStatus.textContent = message;
    transferStatus.className = 'status-detail transfer-status ' + (success ? 'success' : 'error');
  }

  function resetImportFileName() {
    if (importFileName) {
      importFileName.textContent = 'Файл не выбран';
      if (importFileName.classList && typeof importFileName.classList.remove === 'function') {
        importFileName.classList.remove('has-file');
      }
    }
  }

  function setImportFileName(name) {
    if (importFileName) {
      importFileName.textContent = name;
      if (importFileName.classList && typeof importFileName.classList.add === 'function') {
        importFileName.classList.add('has-file');
      }
    }
  }

  function handleImportFile(file) {
    if (!file) return;
    if (file.size > maxProfileSize) {
      transferMessage('Файл слишком большой. Максимум — 1 МБ.', false);
      if (importFile) importFile.value = '';
      resetImportFileName();
      return;
    }
    var version = ++fileReadVersion;
    var reader = new FileReader();
    reader.onload = function () {
      if (version !== fileReadVersion) return;
      importText.value = reader.result;
      setImportFileName(file.name);
      transferMessage('Файл «' + file.name + '» загружен. Нажмите «Применить JSON».', true);
      if (importFile) importFile.value = '';
    };
    reader.onerror = function () {
      if (version !== fileReadVersion) return;
      transferMessage('Не удалось прочитать файл. Выберите его ещё раз.', false);
      if (importFile) importFile.value = '';
      resetImportFileName();
    };
    reader.readAsText(file, 'UTF-8');
  }

  function closeImport() {
    fileReadVersion++;
    importPanel.hidden = true;
    importButton.setAttribute('aria-expanded', 'false');
    resetImportFileName();
    importButton.focus();
  }

  importButton.addEventListener('click', function () {
    if (!importPanel.hidden) { closeImport(); return; }
    importPanel.hidden = false;
    importButton.setAttribute('aria-expanded', 'true');
    importText.focus();
  });
  document.getElementById('btn-cancel-import').addEventListener('click', closeImport);
  importPanel.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') { event.preventDefault(); closeImport(); }
  });
  importText.addEventListener('input', function () {
    fileReadVersion++;
    resetImportFileName();
  });
  if (importFile) {
    importFile.addEventListener('change', function () {
      var file = importFile.files && importFile.files[0];
      if (file) handleImportFile(file);
    });
  }
  if (filePicker && typeof filePicker.addEventListener === 'function') {
    ['dragenter', 'dragover'].forEach(function (eventName) {
      filePicker.addEventListener(eventName, function (event) {
        if (event && event.preventDefault) event.preventDefault();
        if (event && event.stopPropagation) event.stopPropagation();
        if (event && event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
        if (filePicker.classList && typeof filePicker.classList.add === 'function') {
          filePicker.classList.add('is-dragover');
        }
      });
    });
    ['dragleave', 'drop'].forEach(function (eventName) {
      filePicker.addEventListener(eventName, function (event) {
        if (event && event.preventDefault) event.preventDefault();
        if (event && event.stopPropagation) event.stopPropagation();
        if (filePicker.classList && typeof filePicker.classList.remove === 'function') {
          filePicker.classList.remove('is-dragover');
        }
      });
    });
    filePicker.addEventListener('drop', function (event) {
      var dt = event && event.dataTransfer;
      if (dt && dt.files && dt.files[0]) {
        handleImportFile(dt.files[0]);
      }
    });
  }
  document.getElementById('btn-apply-connection').addEventListener('click', function () {
    try {
      if (new Blob([importText.value]).size > maxProfileSize) throw new Error('Максимальный размер JSON — 1 МБ.');
      var profile = parseConnectionProfile(importText.value);
      // Validate everything before replacing any field. Overlay settings stay intact.
      apiUrlInput.value = profile.apiUrl;
      httpMethodSelect.value = profile.httpMethod;
      headersTextarea.value = profile.headers;
      payloadTemplateTextarea.value = profile.payloadTemplate;
      updateSaveState();
      closeImport();
      transferMessage('Подключение загружено в форму. Проверьте и сохраните настройки.', true);
    } catch (error) {
      transferMessage(error.message, false);
      importText.focus();
    }
  });
  function copyToClipboard(text) {
    if (typeof overwolf !== 'undefined' && overwolf.utils && typeof overwolf.utils.placeOnClipboard === 'function') {
      try {
        overwolf.utils.placeOnClipboard(text);
        return true;
      } catch (_) {}
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        navigator.clipboard.writeText(text).catch(function () {});
        return true;
      } catch (_) {}
    }
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    } catch (_) {
      return false;
    }
  }

  function writeOverwolfFile(targetFile, json, callback) {
    var encoding = (overwolf.io && overwolf.io.enums && overwolf.io.enums.eEncoding && overwolf.io.enums.eEncoding.UTF8) || 'UTF8';
    overwolf.io.writeFileContents(targetFile, json, encoding, false, function (writeRes) {
      if (writeRes && writeRes.success) {
        callback(null, 'Файл сохранён: ' + targetFile + ' (и скопирован в буфер обмена)');
      } else {
        var err = writeRes && writeRes.error ? writeRes.error : 'ошибка записи';
        callback(new Error(err), 'Не удалось записать файл (' + err + '). JSON скопирован в буфер обмена.');
      }
    });
  }

  function writeToDefaultOverwolfPath(json, callback) {
    var folder = (overwolf.io && overwolf.io.paths && (overwolf.io.paths.desktop || overwolf.io.paths.documents)) || '';
    var targetFile = (folder ? folder.replace(/[\\\/]+$/, '') + '\\' : '') + 'quicktype-connection.json';
    writeOverwolfFile(targetFile, json, callback);
  }

  function saveOverwolfOrDownload(json, callback) {
    // 2. В среде Overwolf: диалог выбора папки или рабочий стол/документы
    if (typeof overwolf !== 'undefined' && overwolf.io && typeof overwolf.io.writeFileContents === 'function') {
      var picker = overwolf.utils && (overwolf.utils.openNativeFolderPicker || overwolf.utils.openFolderPicker);
      if (typeof picker === 'function') {
        var startFolder = (overwolf.io.paths && (overwolf.io.paths.desktop || overwolf.io.paths.documents)) || '';
        picker(startFolder, function (res) {
          if (res && res.success && res.path) {
            var targetFile = res.path.replace(/[\\\/]+$/, '') + '\\quicktype-connection.json';
            writeOverwolfFile(targetFile, json, callback);
          } else {
            // Пользователь закрыл окно выбора — сохраняем на Рабочий стол по умолчанию
            writeToDefaultOverwolfPath(json, callback);
          }
        });
        return;
      }
      writeToDefaultOverwolfPath(json, callback);
      return;
    }

    // 3. Fallback браузера: <a download>
    try {
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        var blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = 'quicktype-connection.json';
        document.body.appendChild(link);
        link.click();
        setTimeout(function () {
          link.remove();
          URL.revokeObjectURL(url);
        }, 1000);
        callback(null, 'Файл скачан и скопирован в буфер обмена.');
        return;
      }
    } catch (_) {}

    callback(null, 'JSON скопирован в буфер обмена.');
  }

  function saveJsonToFile(json, callback) {
    // 1. Попытка стандартного File System Access API (диалог сохранения файла)
    if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
      window.showSaveFilePicker({
        suggestedName: 'quicktype-connection.json',
        types: [{
          description: 'JSON файл настроек',
          accept: { 'application/json': ['.json'] }
        }]
      }).then(function (handle) {
        return handle.createWritable().then(function (writable) {
          return writable.write(json).then(function () {
            return writable.close();
          });
        });
      }).then(function () {
        callback(null, 'Файл сохранён и скопирован в буфер обмена.');
      }).catch(function (err) {
        if (err && err.name === 'AbortError') {
          callback(null, 'Экспорт отменён (JSON скопирован в буфер обмена).');
        } else {
          saveOverwolfOrDownload(json, callback);
        }
      });
      return;
    }

    saveOverwolfOrDownload(json, callback);
  }


  document.getElementById('btn-export-connection').addEventListener('click', function () {
    try {
      var json = exportConnectionProfile(readForm());
      copyToClipboard(json);
      if (importText) {
        importText.value = json;
      }
      saveJsonToFile(json, function (err, message) {
        transferMessage(message, !err);
      });
    } catch (error) {
      transferMessage('Не удалось экспортировать: ' + error.message, false);
    }
  });

  function emitLiveConfig() {
    var cfg = readForm();
    currentConfig = Object.assign({}, currentConfig, cfg);
    updatePreview();
    updateSaveState();
    if (typeof overwolf !== 'undefined') {
      overwolf.windows.sendMessage('background', 'preview_config', {
        overlayOpacity: cfg.overlayOpacity, overlayBgColor: cfg.overlayBgColor, showHints: cfg.showHints
      }, function () {});
    }
  }

  // Интерактивное обновление ползунка прозрачности
  overlayOpacityInput.addEventListener('input', function () {
    if (opacityValueSpan) opacityValueSpan.textContent = overlayOpacityInput.value + '%';
    emitLiveConfig();
  });

  // Интерактивное обновление цвета фона
  overlayBgColorInput.addEventListener('input', function () {
    emitLiveConfig();
  });

  // Пресеты тем
  document.querySelectorAll('.theme-chip').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var col = btn.getAttribute('data-color');
      var op = btn.getAttribute('data-opacity');
      if (col) overlayBgColorInput.value = col;
      if (op) {
        overlayOpacityInput.value = op;
        if (opacityValueSpan) opacityValueSpan.textContent = op + '%';
      }
      emitLiveConfig();
    });
  });

  // Тумблер подсказок
  showHintsCheckbox.addEventListener('change', function () {
    emitLiveConfig();
  });

  // Кнопка сброса положения и размера окна
  if (btnResetBounds) {
    btnResetBounds.addEventListener('click', function () {
      currentConfig.overlayBounds = null;
      currentConfig.overlayWidth = 640;
      currentConfig.overlayHeight = 100;
      updateOverlayConfig({ overlayBounds: null, overlayWidth: 640, overlayHeight: 100 });

      if (typeof overwolf !== 'undefined') {
        overwolf.windows.sendMessage('background', 'reset_bounds', {}, function () {});
      }
      showStatus('Положение окна сброшено (640×100 по умолчанию)', true);
    });
  }

  // Сохранение настроек
  document.getElementById('btn-save').addEventListener('click', function () {
    var cfg = readForm();

    if (cfg.headers) {
      try {
        parseRequestHeaders(cfg.headers);
      } catch (e) {
        selectTab('connection');
        requestDetails.open = true;
        headersTextarea.focus();
        showStatus('Ошибка в JSON заголовков: ' + e.message, false);
        return;
      }
    }

    currentConfig = Object.assign({}, loadOverlayConfig(), cfg);
    var success = updateOverlayConfig(cfg);
    if (success) {
      savedForm = JSON.stringify(cfg);
      updateSaveState();
      showStatus('Сохранено!', true);
      if (typeof overwolf !== 'undefined') {
        overwolf.windows.sendMessage('background', 'config_updated', currentConfig, function () {});
      }
    } else {
      showStatus('Ошибка сохранения', false);
    }
  });

  function showStatus(msg, isSuccess) {
    if (statusTimer) clearTimeout(statusTimer);
    saveIndicator.textContent = msg;
    saveIndicator.className = 'save-toast ' + (isSuccess ? 'success' : 'error');
    statusTimer = setTimeout(function () {
      saveIndicator.textContent = '';
    }, 4000);
  }

  function formatResponseBody(text) {
    if (!text) return '';
    try {
      var obj = JSON.parse(text);
      return JSON.stringify(obj, null, 2);
    } catch (_) {
      return text;
    }
  }

  // Проверка озвучивания / REST-запроса
  async function performTest() {
    if (btnTestRequest.disabled) return;
    var cfg = readForm();
    var text = testInput.value.trim() || 'Проверка';

    btnTestRequest.disabled = true;
    if (resultBadge) {
      resultBadge.style.display = 'inline-block';
      resultBadge.textContent = 'Отправка...';
      resultBadge.className = 'badge sending';
    }
    resultStatusText.textContent = 'Отправка на ' + (cfg.apiUrl || '...') + '...';
    resultStatusText.className = 'status-detail info';
    if (testResultBox) testResultBox.style.display = 'none';
    testResultBox.open = false;

    try {
      var res = await executeRestRequest(cfg, text);
      btnTestRequest.disabled = false;

      if (res.ok) {
        if (resultBadge) {
          resultBadge.textContent = 'HTTP ' + res.status;
          resultBadge.className = 'badge success';
        }
        resultStatusText.textContent = 'Сервис принял текст · ' + res.durationMs + ' мс';
        resultStatusText.className = 'status-detail success';

        if (testResultBox) {
          testResultBox.style.display = 'block';
          testResultBox.open = false;
          testResultBox.className = 'test-result-box success';
          resultBoxTitle.textContent = 'Сервис принял текст (HTTP ' + res.status + '):';
          resultBoxMeta.textContent = res.durationMs + ' мс';
          resultBoxBody.textContent = res.body ? formatResponseBody(res.body) : '(Запрос успешно принят сервером, тело ответа пустое)';
        }
      } else {
        if (resultBadge) {
          resultBadge.textContent = res.status ? ('HTTP ' + res.status) : 'Сбой';
          resultBadge.className = 'badge error';
        }
        var errorStatusMessage = '';
        if (res.status) {
          var httpReasons = {
            400: 'Некорректный запрос (Bad Request)',
            401: 'Требуется авторизация (Unauthorized)',
            403: 'Доступ запрещён (Forbidden)',
            404: 'Эндпоинт не найден (Not Found). Проверьте URL',
            405: 'Метод не поддерживается (Method Not Allowed)',
            408: 'Превышено время ожидания ответа',
            429: 'Слишком много запросов (Rate Limit)',
            500: 'Внутренняя ошибка сервера',
            502: 'Сервер недоступен (Bad Gateway)',
            503: 'Сервис временно недоступен',
            504: 'Шлюз не отвечает (Gateway Timeout)'
          };
          var statusDesc = httpReasons[res.status] || (res.statusText && res.statusText !== 'OK' ? res.statusText : (res.status >= 500 ? 'Ошибка на стороне сервера' : 'Ошибка запроса'));
          errorStatusMessage = statusDesc + (res.durationMs ? (' · ' + res.durationMs + ' мс') : '');
        } else {
          errorStatusMessage = 'Не удалось связаться с сервером. Проверьте адрес и запущен ли сервис';
        }
        resultStatusText.textContent = errorStatusMessage;
        resultStatusText.className = 'status-detail error';

        if (testResultBox) {
          testResultBox.style.display = 'block';
          testResultBox.open = true;
          testResultBox.className = 'test-result-box error';
          resultBoxTitle.textContent = res.status ? 'Тело ответа сервера:' : 'Причина сбоя:';
          resultBoxMeta.textContent = res.durationMs ? (res.durationMs + ' мс') : '';

          var detailsText = '';
          if (res.body) {
            detailsText = formatResponseBody(res.body);
          } else if (res.status) {
            detailsText = '(Тело ответа пустое)';
          } else if (res.error) {
            detailsText = res.error;
          }
          resultBoxBody.textContent = detailsText || 'Сервер не вернул деталей ошибки.';
        }
      }
    } catch (err) {
      btnTestRequest.disabled = false;
      if (resultBadge) {
        resultBadge.textContent = 'Ошибка';
        resultBadge.className = 'badge error';
      }
      resultStatusText.textContent = 'Исключение: ' + err.message;
      resultStatusText.className = 'status-detail error';

      if (testResultBox) {
        testResultBox.style.display = 'block';
        testResultBox.open = true;
        testResultBox.className = 'test-result-box error';
        resultBoxTitle.textContent = 'Ошибка выполнения:';
        resultBoxMeta.textContent = '';
        resultBoxBody.textContent = err.message;
      }
      // Configuration errors belong to the request editor, even when it was collapsed.
      requestDetails.open = true;
    }
  }

  btnTestRequest.addEventListener('click', performTest);


  testInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      performTest();
    }
  });

  if (btnCloseResult) {
    btnCloseResult.addEventListener('click', function () {
      if (testResultBox) testResultBox.style.display = 'none';
      if (resultBadge) {
        resultBadge.style.display = 'none';
        resultBadge.textContent = 'Готов к тесту';
        resultBadge.className = 'badge';
      }
      if (resultStatusText) {
        resultStatusText.textContent = '';
        resultStatusText.className = 'status-detail';
      }
    });
  }

  // Управление окном настроек (Minimize / Close / Drag)
  var btnWindowMinimize = document.getElementById('btnWindowMinimize');
  var btnWindowClose = document.getElementById('btnWindowClose');
  var windowTitlebar = document.getElementById('windowTitlebar');

  if (btnWindowMinimize) {
    btnWindowMinimize.addEventListener('click', function () {
      if (typeof overwolf !== 'undefined' && overwolf.windows) {
        overwolf.windows.getCurrentWindow(function (res) {
          if (res && res.success) {
            overwolf.windows.minimize(res.window.id, function () {});
          }
        });
      }
    });
  }

  if (btnWindowClose) {
    btnWindowClose.addEventListener('click', function () {
      if (typeof overwolf !== 'undefined' && overwolf.windows) {
        overwolf.windows.getCurrentWindow(function (res) {
          if (res && res.success) {
            overwolf.windows.close(res.window.id, function () {});
          }
        });
      } else {
        window.close();
      }
    });
  }

  if (windowTitlebar) {
    windowTitlebar.addEventListener('mousedown', function (e) {
      if (e.target && e.target.closest && e.target.closest('.window-controls')) return;
      if (e.button !== 0) return;
      if (typeof overwolf !== 'undefined' && overwolf.windows) {
        overwolf.windows.getCurrentWindow(function (res) {
          if (res && res.success) {
            overwolf.windows.dragMove(res.window.id, function () {});
          }
        });
      }
    });
  }
});
