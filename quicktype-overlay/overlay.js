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
  var focusGeneration = 0;
  var focusTimers = [];
  var placement = typeof overwolf !== 'undefined' && typeof overwolf.windows.changePosition === 'function' ? QuickTypeWindows.create(overwolf, false) : null;
  var placementBusy = false;
  var geometryRevision = 0;
  var geometryTimer = null;
  var focusSuspended = false;
  var manualGeometry = false;
  var locallyDismissedGeneration = null;

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
    var previousPlacement = config.overlayPlacement;
    var previousMargin = config.overlayMargin;
    config = Object.assign({}, cfg || loadOverlayConfig(), previewConfig);

    // 1. Применяем фон и прозрачность к контейнеру
    var rgba = hexToRgba(config.overlayBgColor, config.overlayOpacity);
    if (inputField) {
      inputField.style.fontFamily = getOverlayFontFamily(config.overlayFont);
      inputField.style.fontSize = getOverlayFontSize(config.overlayFontSize) + 'px';
    }
    if (previousPlacement !== config.overlayPlacement || previousMargin !== config.overlayMargin) restoreSavedBounds();
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
    if (!inputField || activeRequest || !overlayVisible || focusSuspended || !controllerAllowsFocus()) return;
    // Native focus belongs to the controller. Retries here only focus the DOM
    // field and cannot steal input back from a hidden window or settings.
    inputField.focus();
    try {
      var len = inputField.value.length;
      inputField.setSelectionRange(len, len);
    } catch (_) {}
  }

  function controllerIntent() {
    if (typeof overwolf === 'undefined' || typeof overwolf.windows.getMainWindow !== 'function') return null;
    try {
      var main = overwolf.windows.getMainWindow();
      if (main && typeof main.getOverlayIntent === 'function') {
        return main.getOverlayIntent();
      }
    } catch (_) {}
    return null;
  }

  function controllerAllowsFocus() {
    var intent = controllerIntent();
    return !intent || (intent.visible && intent.focusAllowed);
  }

  function activateOverlay() {
    if (!controllerAllowsFocus()) return;
    cancelFocusRetries();
    var generation = focusGeneration;
    overlayVisible = true;
    focusSuspended = false;
    // Repeated focus messages must not reset pending requests or drafts.
    inputField.readOnly = !!activeRequest;
    focusField();
    autoAdjustHeight();
    restoreSavedBounds();
    [15, 45, 100, 200].forEach(function (delay) {
      focusTimers.push(setTimeout(function () {
        if (overlayVisible && generation === focusGeneration) focusField();
      }, delay));
    });
  }

  function cancelFocusRetries() {
    focusGeneration++;
    focusTimers.forEach(clearTimeout);
    focusTimers = [];
  }

  function clearActiveRequest() {
    if (activeRequest) clearTimeout(activeRequest.timer);
    activeRequest = null;
    inputField.readOnly = false;
  }

  function dismissOverlay() {
    cancelFocusRetries();
    overlayVisible = false;
    clearActiveRequest();
    setStatus('normal');
  }

  function saveCurrentBounds(ignoreAutomaticResize, afterSave) {
    if (typeof overwolf === 'undefined' || !overwolf.windows || placementBusy || manualGeometry) return;
    overwolf.windows.getCurrentWindow(function (res) {
      if (res && res.success && res.window) {
        var w = res.window;
        if (ignoreAutomaticResize && automaticSize &&
            w.width === automaticSize.width && w.height === automaticSize.height &&
            w.left === automaticSize.left && w.top === automaticSize.top) return;
        var bounds = {
          left: w.left,
          top: w.top,
          width: w.width,
          height: w.height
        };
        var revision = geometryRevision;
        QuickTypeWindows.context(overwolf, w, null, false, function (ctx) {
          if (placementBusy || revision !== geometryRevision) return;
          bounds.dpiScale = ctx.scale;
          bounds.context = ctx.kind;
          bounds.coordinateSpace = 'logical';
          config.overlayBounds = bounds;
          config.overlayWidth = w.width;
          config.overlayHeight = w.height;
          updateOverlayConfig({ overlayBounds: bounds, overlayWidth: w.width, overlayHeight: w.height });
          if (afterSave) afterSave();
        });
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
        var focusIntent = controllerIntent();
        var messageGeneration = message.content && message.content.generation;
        if (focusIntent && typeof messageGeneration === 'number' && messageGeneration !== focusIntent.generation) return;
        if (focusIntent && locallyDismissedGeneration !== null &&
            (typeof messageGeneration !== 'number' || messageGeneration <= locallyDismissedGeneration)) return;
        locallyDismissedGeneration = null;
        activateOverlay();
      } else if (message.id === 'config_updated') {
        previewConfig = {};
        applyConfig(message.content);
      } else if (message.id === 'preview_config') {
        Object.assign(previewConfig, getOverlayAppearance(message.content || {}));
        applyConfig(loadOverlayConfig());
      } else if (message.id === 'overlay_hidden') {
        var intent = controllerIntent();
        if (!intent || !intent.visible) dismissOverlay();
      } else if (message.id === 'rest_result') {
        handleRestResult(message.content);
      } else if (message.id === 'reset_bounds') {
        resetWindowBounds();
      } else if (message.id === 'suspend_focus') {
        if (!controllerAllowsFocus()) {
          focusSuspended = true;
          cancelFocusRetries();
        }
      } else if (message.id === 'window_error') {
        setStatus('error', message.content.error);
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
    window.addEventListener('resize', function () {
      if (placementBusy || manualGeometry) return;
      if (config.overlayPlacement === 'bottom') scheduleGeometry();
      else debouncedSaveBounds();
    });
    if (overwolf.windows.onScreenPropertyChanged) overwolf.windows.onScreenPropertyChanged.addListener(function (event) {
      withCurrentWindowId(function (id) { if (event.id === id || event.name === 'overlay') scheduleGeometry(); });
    });
    if (overwolf.games && overwolf.games.onGameInfoUpdated) overwolf.games.onGameInfoUpdated.addListener(scheduleGeometry);
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
      if (placement) placement.cancel();
      geometryRevision++;
      placementBusy = false;
      manualGeometry = true;
      automaticSize = null;
      // The third argument is the content rectangle, not a callback.
      var rect = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      overwolf.windows.dragResize(winId, edge, rect, function (result) {
        manualGeometry = false;
        if (result && result.success === false) {
          setStatus('error', "Could not resize the window: " + (result.error || "Overwolf error"));
          return;
        }
        saveCurrentBounds(false, function () {
          if (config.overlayPlacement === 'bottom') scheduleGeometry();
        });
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
      if (placement) placement.cancel();
      geometryRevision++;
      placementBusy = false;
      manualGeometry = true;
      overwolf.windows.dragMove(winId, function (result) {
        manualGeometry = false;
        if (result && result.success === false) return;
        config.overlayPlacement = 'free';
        updateOverlayConfig({ overlayPlacement: 'free' });
        overwolf.windows.sendMessage('desktop', 'placement_changed', { mode: 'free' }, function () {});
        saveCurrentBounds();
      });
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
      // Even an unchanged initial size is automatic. Closing the untouched
      // window must not persist it as a manual height and disable auto-sizing.
      if (!automaticSize) {
        automaticSize = { width: win.width, height: win.height, left: win.left, top: win.top };
      }
      if (Math.abs(win.height - targetHeight) > 6) {
        if (placement) {
          placeOverlay({ bounds: Object.assign({}, win, { height: targetHeight, dpiScale: undefined }) }, true);
          return;
        }
        automaticSize = { width: win.width, height: targetHeight, left: win.left, top: win.top };
        overwolf.windows.changeSize(win.id, win.width, targetHeight, function () {});
      }
    });
  }

  function resetWindowBounds() {
    if (placement) {
      placeOverlay({ bounds: null, center: true, reset: true }, true);
      return;
    }
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
    if (placement) {
      var latest = loadOverlayConfig();
      config.overlayBounds = latest.overlayBounds;
      config.overlayPlacement = latest.overlayPlacement;
      config.overlayMargin = latest.overlayMargin;
      placeOverlay({ bounds: latest.overlayBounds }, !latest.overlayBounds);
      return;
    }
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

  function scheduleGeometry() {
    if (manualGeometry) return;
    if (geometryTimer) clearTimeout(geometryTimer);
    geometryTimer = setTimeout(function () { if (overlayVisible) restoreSavedBounds(); }, 80);
  }

  function placeOverlay(options, automatic) {
    if (!placement) return;
    var revision = ++geometryRevision;
    if (saveBoundsTimer) clearTimeout(saveBoundsTimer);
    placementBusy = true;
    options.mode = config.overlayPlacement;
    options.margin = normalizeOverlayMargin(config.overlayMargin);
    if (options.reset) options.mode = 'free';
    placement.place(options, function (result, bounds) {
      if (revision !== geometryRevision) return;
      placementBusy = false;
      if (!result.success) {
        if (!result.cancelled) setStatus('error', 'Could not position window: ' + result.error);
      } else {
        if (automatic) automaticSize = bounds;
        else {
          config.overlayBounds = bounds;
          updateOverlayConfig({ overlayBounds: bounds, overlayWidth: bounds.width, overlayHeight: bounds.height });
        }
        if (options.reset) {
          automaticSize = bounds;
          config.overlayBounds = null;
          config.overlayPlacement = 'free';
          updateOverlayConfig({ overlayBounds: null, overlayWidth: bounds.width, overlayHeight: bounds.height, overlayPlacement: 'free' });
          overwolf.windows.sendMessage('desktop', 'placement_changed', { mode: 'free' }, function () {});
        }
      }
      if (options.reset && !result.cancelled) overwolf.windows.sendMessage('desktop', 'geometry_result',
        { ok: !!result.success, error: result.error || '' }, function () {});
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
    var intent = controllerIntent();
    if (intent) locallyDismissedGeneration = intent.generation;
    dismissOverlay();
    if (typeof overwolf !== 'undefined') {
      debouncedSaveBounds();
      overwolf.windows.sendMessage('background', 'hide_overlay', {}, function () {});
    }
  }
});
