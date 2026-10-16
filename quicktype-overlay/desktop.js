document.addEventListener('DOMContentLoaded', function () {
  // Элементы формы
  var serviceTypeSelect = document.getElementById('serviceType');
  var serviceHint = document.getElementById('serviceHint');
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

  function applyTheme() {
    var theme = appTheme.value === 'system' ? (systemTheme && systemTheme.matches ? 'light' : 'dark') : appTheme.value;
    document.documentElement.setAttribute('data-theme', theme);
  }

  appTheme.value = readPreference('quicktype_desktop_theme', 'system');
  if (['system', 'dark', 'light'].indexOf(appTheme.value) === -1) appTheme.value = 'system';
  applyTheme();
  appTheme.addEventListener('change', function () {
    applyTheme();
    writePreference('quicktype_desktop_theme', appTheme.value);
  });
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

  function updateServiceHint() {
    if (!serviceHint || !serviceTypeSelect) return;
    if (serviceTypeSelect.value === 'ttsbard') {
      serviceHint.textContent = 'Используется локальный сервер TTSBard (по умолчанию http://127.0.0.1:10101/v1/speech).';
    } else {
      serviceHint.textContent = 'URL любого внешнего сервиса или webhook, принимающего HTTP-запросы.';
    }
  }

  if (serviceTypeSelect) {
    serviceTypeSelect.addEventListener('change', function () {
      if (serviceTypeSelect.value === 'ttsbard') {
        apiUrlInput.value = 'http://127.0.0.1:10101/v1/speech';
        httpMethodSelect.value = 'POST';
      }
      updateServiceHint();
      updateSaveState();
    });
  }

  apiUrlInput.addEventListener('input', function () {
    if (serviceTypeSelect) {
      var val = apiUrlInput.value.trim();
      var isTTSBard = !val || val.indexOf('10101') !== -1;
      serviceTypeSelect.value = isTTSBard ? 'ttsbard' : 'custom';
      updateServiceHint();
    }
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
    
    if (serviceTypeSelect) {
      var isTTSBard = !cfg.apiUrl || cfg.apiUrl.indexOf('10101') !== -1;
      serviceTypeSelect.value = isTTSBard ? 'ttsbard' : 'custom';
      updateServiceHint();
    }

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
    var text = testInput.value.trim();

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
        resultStatusText.textContent = res.status ? ('Ошибка сервера: HTTP ' + res.status) : 'Не удалось связаться с сервером';
        resultStatusText.className = 'status-detail error';

        if (testResultBox) {
          testResultBox.style.display = 'block';
          testResultBox.open = true;
          testResultBox.className = 'test-result-box error';
          resultBoxTitle.textContent = res.status ? ('Ответ сервера (HTTP ' + res.status + '):') : 'Причина сбоя:';
          resultBoxMeta.textContent = res.durationMs ? (res.durationMs + ' мс') : '';

          var detailsText = '';
          if (res.body) {
            detailsText = formatResponseBody(res.body);
          }
          if (res.error) {
            detailsText = detailsText ? (detailsText + '\n\n' + res.error) : res.error;
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

  if (typeof overwolf !== 'undefined' && overwolf.settings && overwolf.settings.hotkeys && overwolf.settings.hotkeys.get) {
    overwolf.settings.hotkeys.get(function (result) {
      if (!result || !result.success) return;
      var hotkeys = result && result.games ? Object.keys(result.games).reduce(function (all, key) {
        return all.concat(result.games[key]);
      }, []) : [];
      hotkeys = hotkeys.concat(result && result.globals || []);
      var bindings = hotkeys.filter(function (item) { return item.name === 'toggle_input_form'; }).map(function (item) {
        return item.IsUnassigned ? 'Не назначена' : item.binding;
      }).filter(function (binding, index, all) { return binding && all.indexOf(binding) === index; });
      if (bindings.length) document.getElementById('overlayHotkey').textContent = bindings.length === 1 ? bindings[0] : 'Зависит от игры';
    });
  }

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
      if (e.target && e.target.closest && e.target.closest('.window-control-btn')) return;
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
