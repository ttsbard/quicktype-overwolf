document.addEventListener('DOMContentLoaded', function () {
  var inputField = document.getElementById('inputText');
  var hudContainer = document.getElementById('hudContainer');
  var hudDrag = document.getElementById('hudDrag');
  var hudResizeGrip = document.getElementById('hudResizeGrip');
  var hudStatusBanner = document.getElementById('hudStatusBanner');
  var hudStatusText = document.getElementById('hudStatusText');
  var closeErrorButton = document.getElementById('btn-close-error');
  var closeOverlayButton = document.getElementById('btn-close-overlay');
  var hudFooter = document.getElementById('hudFooter');
  var settingsButton = document.getElementById('btn-open-settings');

  if (settingsButton) settingsButton.addEventListener('click', function () {
    if (typeof overwolf !== 'undefined') {
      overwolf.windows.sendMessage('background', 'open_settings', {}, function () {});
    }
  });

  if (closeOverlayButton) closeOverlayButton.addEventListener('click', hideOverlay);
  if (closeErrorButton) closeErrorButton.addEventListener('click', function () {
    setStatus('normal');
    focusField();
  });

  var config = loadOverlayConfig();
  var isSubmitting = false;
  var activeRequest = null;
  var requestSequence = 0;
  var requestPrefix = Date.now().toString(36) + Math.random().toString(36).slice(2);
  var overlayVisible = true;
  var previewConfig = {};
  var statusTimeout = null;
  var sendingDelayTimer = null;
  var saveBoundsTimer = null;

  function hexToRgba(hex, opacityPercent) {
    if (!hex) hex = '#0e0e12';
    var clean = hex.replace('#', '');
    if (clean.length === 3) {
      clean = clean.split('').map(function (c) { return c + c; }).join('');
    }
    var num = parseInt(clean, 16);
    var r = (num >> 16) & 255;
    var g = (num >> 8) & 255;
    var b = num & 255;
    var alpha = Math.max(0.15, Math.min(1.0, (opacityPercent != null ? opacityPercent : 90) / 100));
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
  }

  function applyConfig(cfg) {
    config = Object.assign({}, cfg || loadOverlayConfig(), previewConfig);

    // 1. Применяем фон и прозрачность к контейнеру
    var rgba = hexToRgba(config.overlayBgColor, config.overlayOpacity);
    if (inputField) {
      inputField.style.fontFamily = getOverlayFontFamily(config.overlayFont);
      inputField.style.fontSize = getOverlayFontSize(config.overlayFontSize) + 'px';
    }
    if (hudContainer) {
      hudContainer.style.setProperty('--hud-bg', rgba);
      var rgb = rgba.match(/[\d.]+/g);
      var light = Number(rgb[0]) * 0.2126 + Number(rgb[1]) * 0.7152 + Number(rgb[2]) * 0.0722 > 170;
      if (light) hudContainer.classList.add('hud-light');
      else hudContainer.classList.remove('hud-light');
    }

    // 2. Управление видимостью подсказок
    if (hudFooter) {
      if (config.showHints === false) {
        hudFooter.classList.add('hidden');
      } else {
        hudFooter.classList.remove('hidden');
      }
    }
  }

  function setStatus(type, text) {
    if (statusTimeout) {
      clearTimeout(statusTimeout);
      statusTimeout = null;
    }
    if (sendingDelayTimer) {
      clearTimeout(sendingDelayTimer);
      sendingDelayTimer = null;
    }

    if (!hudContainer || !hudStatusBanner || !hudStatusText) return;
    if (closeErrorButton) closeErrorButton.hidden = type !== 'error';

    if (type === 'sending') {
      hudStatusBanner.style.display = 'none';
      hudStatusText.textContent = '';
      hudStatusBanner.className = 'hud-status-banner';
      // Короткий статус только при задержке отправки
      sendingDelayTimer = setTimeout(function () {
        if (isSubmitting && overlayVisible) {
          hudStatusBanner.className = 'hud-status-banner info';
          hudStatusText.textContent = 'Отправка...';
          hudStatusBanner.style.display = 'flex';
        }
      }, 800);
      return;
    }

    if (type !== 'error') {
      hudStatusBanner.style.display = 'none';
      hudStatusText.textContent = '';
      hudStatusBanner.className = 'hud-status-banner';
      return;
    }

    // Отображаем исключительно сообщение об ошибке (без цветных подсветок окна)
    hudStatusBanner.className = 'hud-status-banner error';
    hudStatusText.textContent = text || 'Не удалось отправить. Enter — повторить';
    hudStatusBanner.style.display = 'flex';
  }

  function focusField() {
    if (!inputField || isSubmitting || !overlayVisible) return;
    try {
      window.focus();
    } catch (_) {}
    if (typeof overwolf !== 'undefined' && overwolf.windows && typeof overwolf.windows.requestOverlayFocus === 'function') {
      try {
        overwolf.windows.requestOverlayFocus('overlay', function () {});
      } catch (_) {}
    }
    inputField.focus();
    try {
      var len = inputField.value.length;
      inputField.setSelectionRange(len, len);
    } catch (_) {}
  }

  function activateOverlay() {
    overlayVisible = true;
    // Repeated focus messages must not reset pending requests or drafts.
    inputField.readOnly = isSubmitting;
    focusField();
    autoAdjustHeight();
    [15, 45, 100, 200].forEach(function (delay) {
      setTimeout(function () { if (overlayVisible) focusField(); }, delay);
    });
  }

  function dismissOverlay() {
    overlayVisible = false;
    if (activeRequest) clearTimeout(activeRequest.timer);
    if (sendingDelayTimer) {
      clearTimeout(sendingDelayTimer);
      sendingDelayTimer = null;
    }
    activeRequest = null;
    isSubmitting = false;
    inputField.readOnly = false;
    setStatus('normal');
  }

  function saveCurrentBounds() {
    if (typeof overwolf === 'undefined' || !overwolf.windows) return;
    overwolf.windows.getCurrentWindow(function (res) {
      if (res && res.success && res.window) {
        var w = res.window;
        config.overlayBounds = {
          left: w.left,
          top: w.top,
          width: w.width,
          height: w.height
        };
        config.overlayWidth = w.width;
        config.overlayHeight = w.height;
        updateOverlayConfig({ overlayBounds: config.overlayBounds,
          overlayWidth: w.width, overlayHeight: w.height });
      }
    });
  }

  function debouncedSaveBounds() {
    if (saveBoundsTimer) clearTimeout(saveBoundsTimer);
    saveBoundsTimer = setTimeout(saveCurrentBounds, 500);
  }

  // Захват фокуса и обработка IPC сообщений от background
  if (typeof overwolf !== 'undefined') {
    overwolf.windows.onMessageReceived.addListener(function (message) {
      if (message.id === 'focus_input_field') {
        activateOverlay();
      } else if (message.id === 'config_updated') {
        previewConfig = {};
        applyConfig(message.content);
      } else if (message.id === 'preview_config') {
        var preview = message.content || {};
        ['overlayOpacity', 'overlayBgColor', 'showHints', 'overlayFont', 'overlayFontSize'].forEach(function (key) {
          if (Object.prototype.hasOwnProperty.call(preview, key)) previewConfig[key] = preview[key];
        });
        applyConfig(loadOverlayConfig());
      } else if (message.id === 'overlay_hidden') {
        dismissOverlay();
      } else if (message.id === 'rest_result') {
        handleRestResult(message.content);
      } else if (message.id === 'reset_bounds') {
        resetWindowBounds();
      }
    });

    // Обработчик перемещения окна за верхнюю планку
    if (hudDrag) {
      hudDrag.addEventListener('mousedown', function (e) {
        startDragMove(e);
      });
    }

    // Обработчики масштабирования окна за грани и углы
    var resizeHandles = [
      { id: 'hudResizeTop', edge: 'Top' },
      { id: 'hudResizeBottom', edge: 'Bottom' },
      { id: 'hudResizeLeft', edge: 'Left' },
      { id: 'hudResizeRight', edge: 'Right' },
      { id: 'hudResizeTopLeft', edge: 'TopLeft' },
      { id: 'hudResizeTopRight', edge: 'TopRight' },
      { id: 'hudResizeBottomLeft', edge: 'BottomLeft' },
      { id: 'hudResizeGrip', edge: 'BottomRight' }
    ];
    resizeHandles.forEach(function (h) {
      var el = document.getElementById(h.id);
      if (el) {
        el.addEventListener('mousedown', function (e) {
          startDragResize(h.edge, e);
        });
      }
    });

    // Слушаем изменение размеров окна для автосохранения
    window.addEventListener('resize', debouncedSaveBounds);
  }

  var currentWindowId = null;

  function cacheCurrentWindowId() {
    if (typeof overwolf !== 'undefined' && overwolf.windows) {
      overwolf.windows.getCurrentWindow(function (res) {
        if (res && res.success && res.window) {
          currentWindowId = res.window.id;
        }
      });
    }
  }

  function getDragEdge(edgeName) {
    if (typeof overwolf !== 'undefined' && overwolf.windows && overwolf.windows.enums && overwolf.windows.enums.WindowDragEdge) {
      if (overwolf.windows.enums.WindowDragEdge[edgeName] !== undefined) {
        return overwolf.windows.enums.WindowDragEdge[edgeName];
      }
    }
    return edgeName;
  }

  function startDragResize(edgeName, e) {
    if (e && e.button !== 0) return;
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (typeof overwolf === 'undefined' || !overwolf.windows) return;
    var edge = getDragEdge(edgeName);
    var doResize = function (winId) {
      // The third argument is the content rectangle, not a callback.
      var rect = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      overwolf.windows.dragResize(winId, edge, rect, function (result) {
        if (result && result.success === false) {
          setStatus('error', 'Не удалось изменить размер окна: ' + (result.error || 'ошибка Overwolf'));
          return;
        }
        saveCurrentBounds();
      });
    };
    if (currentWindowId) {
      doResize(currentWindowId);
    } else {
      overwolf.windows.getCurrentWindow(function (res) {
        if (res && res.success && res.window) {
          currentWindowId = res.window.id;
          doResize(currentWindowId);
        }
      });
    }
  }

  function startDragMove(e) {
    if (e && e.button !== 0) return;
    if (e) {
      e.preventDefault();
    }
    if (typeof overwolf === 'undefined' || !overwolf.windows) return;
    var doMove = function (winId) {
      overwolf.windows.dragMove(winId, debouncedSaveBounds);
    };
    if (currentWindowId) {
      doMove(currentWindowId);
    } else {
      overwolf.windows.getCurrentWindow(function (res) {
        if (res && res.success && res.window) {
          currentWindowId = res.window.id;
          doMove(currentWindowId);
        }
      });
    }
  }

  function autoAdjustHeight() {
    if (typeof overwolf === 'undefined' || !overwolf.windows || typeof overwolf.windows.changeSize !== 'function' || !inputField) return;
    if (config.overlayBounds && typeof config.overlayBounds.height === 'number') return;
    overwolf.windows.getCurrentWindow(function (res) {
      if (!res || !res.success || !res.window) return;
      var win = res.window;
      var text = inputField.value || '';
      var lines = text.split('\n').length;
      if (text.length > 55) {
        lines = Math.max(lines, Math.ceil(text.length / 48));
      }
      var targetHeight = 100;
      if (lines > 1) {
        targetHeight = Math.min(240, 100 + (lines - 1) * 26);
      }
      if (Math.abs(win.height - targetHeight) > 6) {
        overwolf.windows.changeSize(win.id, win.width, targetHeight, function () {});
      }
    });
  }

  function resetWindowBounds() {
    if (typeof overwolf === 'undefined' || !overwolf.windows || typeof overwolf.windows.changeSize !== 'function') return;
    overwolf.windows.getCurrentWindow(function (res) {
      if (res.success) {
        var defaultW = 640;
        var defaultH = 100;
        overwolf.windows.changeSize(res.window.id, defaultW, defaultH, function () {
          overwolf.windows.changePosition(res.window.id, 100, 100, function () {
            config.overlayBounds = null;
            config.overlayWidth = defaultW;
            config.overlayHeight = defaultH;
            updateOverlayConfig({ overlayBounds: null, overlayWidth: defaultW, overlayHeight: defaultH });
          });
        });
      }
    });
  }

  function handleRestResult(content) {
    if (!content || !activeRequest || content.requestId !== activeRequest.id) return;
    var completed = activeRequest;
    clearTimeout(completed.timer);
    if (content.ok) {
      if (completed.clear && inputField.value === completed.text) {
        inputField.value = '';
        autoAdjustHeight();
      }
      statusTimeout = setTimeout(function () {
        if (activeRequest !== completed) return;
        setStatus('normal');
        activeRequest = null;
        isSubmitting = false;
        inputField.readOnly = false;
        if (completed.close && overlayVisible) hideOverlay();
        else if (overlayVisible) focusField();
      }, 350);
    } else {
      activeRequest = null;
      isSubmitting = false;
      inputField.readOnly = false;
      setStatus('error', content.error || 'Не удалось отправить. Enter — повторить');
      if (overlayVisible) focusField();
    }
  }

  // Restore only valid bounds; Overwolf clamps an in-game window on restore.
  function restoreSavedBounds() {
    if (typeof overwolf === 'undefined') return;
    var bounds = config.overlayBounds;
    if (!bounds || !['left', 'top', 'width', 'height'].every(function (key) {
      return typeof bounds[key] === 'number' && isFinite(bounds[key]);
    })) return;
    overwolf.windows.getCurrentWindow(function (res) {
      if (!res.success) return;
      overwolf.windows.changeSize(res.window.id, Math.max(240, Math.min(1920, bounds.width)),
        Math.max(60, Math.min(1080, bounds.height)), function (result) {
          if (result.success) overwolf.windows.changePosition(res.window.id, bounds.left, bounds.top, function () {});
        });
    });
  }

  // Дублирование фокуса при системных событиях
  window.addEventListener('focus', function () {
    if (overlayVisible && !isSubmitting) focusField();
  });
  document.addEventListener('visibilitychange', function () {
    if (overlayVisible && !document.hidden && !isSubmitting) {
      focusField();
    }
  });

  // Сброс ошибки и динамическое изменение высоты при редактировании текста
  inputField.addEventListener('input', function () {
    if (hudStatusBanner && hudStatusBanner.style.display !== 'none') {
      setStatus('normal');
    }
    autoAdjustHeight();
  });

  // Первичная инициализация конфигурации и стилей
  applyConfig(config);
  cacheCurrentWindowId();
  restoreSavedBounds();
  activateOverlay();

  // Обработка клавиатуры
  inputField.addEventListener('keydown', function (event) {
    // 1. Обработка ESCAPE — мгновенное скрытие
    if (event.key === 'Escape' || event.code === 'Escape') {
      if (config.closeOnEscape === false) return;
      event.preventDefault();
      event.stopPropagation();
      hideOverlay();
      return;
    }

    // 2. Обработка ENTER
    if (event.key === 'Enter' || event.code === 'Enter') {
      if (event.shiftKey || event.ctrlKey) {
        return; // Перенос строки
      }

      if (event.altKey || event.metaKey || event.isComposing || event.keyCode === 229 || event.repeat) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (isSubmitting) return;

      var text = inputField.value.trim();
      if (!text) {
        hideOverlay();
        return;
      }

      // Переводим в состояние ожидания
      var requestId = requestPrefix + '-' + (++requestSequence);
      activeRequest = { id: requestId, text: inputField.value,
        clear: config.clearOnSubmit !== false, close: config.closeOnSubmit !== false };
      isSubmitting = true;
      inputField.readOnly = true;
      setStatus('sending', 'Отправка...');
      // Also recover if the controller reloads or an IPC reply is lost.
      activeRequest.timer = setTimeout(function () {
        handleRestResult({ ok: false, requestId: requestId,
          error: 'Нет ответа контроллера. Сервер мог принять запрос; проверьте результат перед повтором.' });
      }, REQUEST_TIMEOUT_MS + 1000);

      if (typeof overwolf !== 'undefined') {
        overwolf.windows.sendMessage('background', 'submit_text', { text: text, requestId: requestId }, function (result) {
          if (result && result.success === false) {
            handleRestResult({ ok: false, requestId: requestId, error: result.error || 'Не удалось передать запрос контроллеру' });
          }
        });
      } else {
        // Режим локального тестирования без Overwolf
        executeRestRequest(config, text)
          .then(function (res) {
            handleRestResult(Object.assign({}, res, { requestId: requestId }));
          })
          .catch(function (err) {
            handleRestResult({ ok: false, error: err.message, requestId: requestId });
          });
      }
    }
  });

  function hideOverlay() {
    dismissOverlay();
    if (typeof overwolf !== 'undefined') {
      debouncedSaveBounds();
      overwolf.windows.sendMessage('background', 'hide_overlay', {}, function () {});
    }
  }
});
