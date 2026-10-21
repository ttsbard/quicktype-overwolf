document.addEventListener('DOMContentLoaded', function () {
  var inputField = document.getElementById('inputText');
  var hudContainer = document.getElementById('hudContainer');
  var hudDrag = document.getElementById('hudDrag');
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
  var activeRequest = null;
  var requestSequence = 0;
  var requestPrefix = Date.now().toString(36) + Math.random().toString(36).slice(2);
  var overlayVisible = true;
  var previewConfig = {};
  var statusTimeout = null;
  var sendingDelayTimer = null;
  var saveBoundsTimer = null;
  var automaticSize = null;

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
      setText(hudStatusText, '');
      hudStatusBanner.className = 'hud-status-banner';
      // Короткий статус только при задержке отправки
      sendingDelayTimer = setTimeout(function () {
        if (activeRequest && overlayVisible) {
          hudStatusBanner.className = 'hud-status-banner info';
          setText(hudStatusText, "Sending...");
          hudStatusBanner.style.display = 'flex';
        }
      }, 800);
      return;
    }

    if (type !== 'error') {
      hudStatusBanner.style.display = 'none';
      setText(hudStatusText, '');
      hudStatusBanner.className = 'hud-status-banner';
      return;
    }

    // Отображаем исключительно сообщение об ошибке (без цветных подсветок окна)
    hudStatusBanner.className = 'hud-status-banner error';
    setText(hudStatusText, text || "Could not send. Enter — retry");
    hudStatusBanner.style.display = 'flex';
  }

  function focusField() {
    if (!inputField || activeRequest || !overlayVisible) return;
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
    inputField.readOnly = !!activeRequest;
    focusField();
    autoAdjustHeight();
    [15, 45, 100, 200].forEach(function (delay) {
      setTimeout(function () { if (overlayVisible) focusField(); }, delay);
    });
  }

  function clearActiveRequest() {
    if (activeRequest) clearTimeout(activeRequest.timer);
    activeRequest = null;
    inputField.readOnly = false;
  }

  function dismissOverlay() {
    overlayVisible = false;
    clearActiveRequest();
    setStatus('normal');
  }

  function saveCurrentBounds(ignoreAutomaticResize) {
    if (typeof overwolf === 'undefined' || !overwolf.windows) return;
    overwolf.windows.getCurrentWindow(function (res) {
      if (res && res.success && res.window) {
        var w = res.window;
        if (ignoreAutomaticResize && automaticSize &&
            w.width === automaticSize.width && w.height === automaticSize.height &&
            w.left === automaticSize.left && w.top === automaticSize.top) return;
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
    saveBoundsTimer = setTimeout(function () { saveCurrentBounds(true); }, 500);
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
        Object.assign(previewConfig, getOverlayAppearance(message.content || {}));
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

  function withCurrentWindowId(callback) {
    if (typeof overwolf === 'undefined' || !overwolf.windows) return;
    if (currentWindowId) {
      callback(currentWindowId);
      return;
    }
    overwolf.windows.getCurrentWindow(function (res) {
      if (res && res.success && res.window) {
        currentWindowId = res.window.id;
        callback(currentWindowId);
      }
    });
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
    withCurrentWindowId(function (winId) {
      automaticSize = null;
      // The third argument is the content rectangle, not a callback.
      var rect = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      overwolf.windows.dragResize(winId, edge, rect, function (result) {
        if (result && result.success === false) {
          setStatus('error', "Could not resize the window: " + (result.error || "Overwolf error"));
          return;
        }
        saveCurrentBounds();
      });
    });
  }

  function startDragMove(e) {
    if (e && e.button !== 0) return;
    if (e) {
      e.preventDefault();
    }
    if (typeof overwolf === 'undefined' || !overwolf.windows) return;
    withCurrentWindowId(function (winId) {
      overwolf.windows.dragMove(winId, debouncedSaveBounds);
    });
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
        automaticSize = { width: win.width, height: targetHeight, left: win.left, top: win.top };
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
        if (saveBoundsTimer) clearTimeout(saveBoundsTimer);
        automaticSize = { width: defaultW, height: defaultH, left: 100, top: 100 };
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
        clearActiveRequest();
        if (completed.close && overlayVisible) hideOverlay();
        else if (overlayVisible) focusField();
      }, 350);
    } else {
      clearActiveRequest();
      setStatus('error', content.error || "Could not send. Enter — retry");
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
    if (overlayVisible) focusField();
  });
  document.addEventListener('visibilitychange', function () {
    if (overlayVisible && !document.hidden) {
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

      if (activeRequest) return;

      var text = inputField.value.trim();
      if (!text) {
        hideOverlay();
        return;
      }

      // Переводим в состояние ожидания
      var requestId = requestPrefix + '-' + (++requestSequence);
      activeRequest = { id: requestId, text: inputField.value,
        clear: config.clearOnSubmit !== false, close: config.closeOnSubmit !== false };
      inputField.readOnly = true;
      setStatus('sending', "Sending...");
      // Also recover if the controller reloads or an IPC reply is lost.
      activeRequest.timer = setTimeout(function () {
        handleRestResult({ ok: false, requestId: requestId,
          error: "No controller response. The server may have accepted the request; check before retrying." });
      }, REQUEST_TIMEOUT_MS + 1000);

      if (typeof overwolf !== 'undefined') {
        overwolf.windows.sendMessage('background', 'submit_text', { text: text, requestId: requestId }, function (result) {
          if (result && result.success === false) {
            handleRestResult({ ok: false, requestId: requestId, error: result.error || "Could not pass the request to the controller" });
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
