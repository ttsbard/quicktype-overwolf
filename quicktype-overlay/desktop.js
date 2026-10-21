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
  var overlayFontSelect = document.getElementById('overlayFont');
  var overlayFontSizeInput = document.getElementById('overlayFontSize');
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
  var savedForm;
  var statusTimer;
  var settingsFitVersion = 0;
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
      setControlAttribute(themeToggleBtn, 'title', "Switch to light theme");
      setControlAttribute(themeToggleBtn, 'aria-label', "Switch to light theme");
    } else {
      setControlAttribute(themeToggleBtn, 'title', "Switch to dark theme");
      setControlAttribute(themeToggleBtn, 'aria-label', "Switch to dark theme");
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
    fitSettingsWindow();
  }

  function fitSettingsWindow() {
    if (typeof overwolf === 'undefined' || !overwolf.windows ||
        typeof overwolf.windows.changeSize !== 'function' || !window.requestAnimationFrame) return;
    var version = ++settingsFitVersion;
    window.requestAnimationFrame(function () {
      if (version !== settingsFitVersion) return;
      overwolf.windows.getCurrentWindow(function (result) {
        if (version !== settingsFitVersion || !result || !result.success || !result.window) return;
        var win = result.window;
        var panel = document.getElementById('panel-overlay');
        var height = 750;
        if (!panel.hidden) {
          var main = document.querySelector('.settings-panel');
          var style = window.getComputedStyle(main);
          var contentHeight = panel.getBoundingClientRect().height +
            parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
          height = Math.max(700, Math.min(750, Math.ceil(win.height + contentHeight - main.clientHeight)));
        }
        if (Math.abs(win.height - height) >= 1) {
          overwolf.windows.changeSize(win.id, win.width, height, function () {});
        }
      });
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
  populateForm(loadOverlayConfig());
  savedForm = JSON.stringify(readForm());
  updateSaveState();
  updateThemeChips();

  document.querySelectorAll('.settings-panel input, .settings-panel select, .settings-panel textarea').forEach(function (input) {
    if (input === testInput) return;
    input.addEventListener('input', updateSaveState);
    input.addEventListener('change', updateSaveState);
  });

  function updateSaveState() {
    var form = readForm();
    var saved = JSON.parse(savedForm);
    var dirty = JSON.stringify(form) !== savedForm;
    var previewChanged = OVERLAY_APPEARANCE_FIELDS.some(function (key) {
      return form[key] !== saved[key];
    });
    setText(dirtyIndicator, previewChanged ? "Preview applied · click Save" :
      dirty ? "Unsaved changes" : "All changes saved");
    if (dirty) dirtyIndicator.classList.add('dirty');
    else dirtyIndicator.classList.remove('dirty');
    saveButton.disabled = !dirty;
  }

  function updateThemeChips() {
    var cfg = readForm();
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
    if (opacityValueSpan) setText(opacityValueSpan, opVal + '%');

    overlayBgColorInput.value = cfg.overlayBgColor || '#0e0e12';
    showHintsCheckbox.checked = cfg.showHints !== false;
    var family = normalizeFontFamily(cfg.overlayFont) || 'default';
    ensureFontOption(family);
    overlayFontSelect.value = family;
    overlayFontSizeInput.value = getOverlayFontSize(cfg.overlayFontSize);

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
      overlayFont: overlayFontSelect.value,
      overlayFontSize: getOverlayFontSize(overlayFontSizeInput.value),
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
    setText(transferStatus, message);
    transferStatus.className = 'status-detail transfer-status ' + (success ? 'success' : 'error');
  }

  function resetImportFileName() {
    if (importFileName) {
      setText(importFileName, "No file selected");
      if (importFileName.classList && typeof importFileName.classList.remove === 'function') {
        importFileName.classList.remove('has-file');
      }
    }
  }

  function setImportFileName(name) {
    if (importFileName) {
      setText(importFileName, name);
      if (importFileName.classList && typeof importFileName.classList.add === 'function') {
        importFileName.classList.add('has-file');
      }
    }
  }

  function handleImportFile(file) {
    if (!file) return;
    var version = ++fileReadVersion;
    if (file.size > maxProfileSize) {
      transferMessage("File is too large. Maximum size: 1 MB.", false);
      if (importFile) importFile.value = '';
      resetImportFileName();
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      if (version !== fileReadVersion) return;
      importText.value = reader.result;
      setImportFileName(file.name);
      transferMessage("File “" + file.name + "” loaded. Click Apply.", true);
      if (importFile) importFile.value = '';
    };
    reader.onerror = function () {
      if (version !== fileReadVersion) return;
      transferMessage("Could not read the file. Select it again.", false);
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
      if (new Blob([importText.value]).size > maxProfileSize) throw new Error("Maximum JSON size: 1 MB.");
      var profile = parseConnectionProfile(importText.value);
      // Validate everything before replacing any field. Overlay settings stay intact.
      apiUrlInput.value = profile.apiUrl;
      httpMethodSelect.value = profile.httpMethod;
      headersTextarea.value = profile.headers;
      payloadTemplateTextarea.value = profile.payloadTemplate;
      updateSaveState();
      closeImport();
      transferMessage("Connection loaded into the form. Review and save the settings.", true);
    } catch (error) {
      transferMessage(error.message, false);
      importText.focus();
    }
  });
  async function copyToClipboard(text) {
    if (typeof overwolf !== 'undefined' && overwolf.utils && typeof overwolf.utils.placeOnClipboard === 'function') {
      try {
        overwolf.utils.placeOnClipboard(text);
        return true;
      } catch (_) {}
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
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
      var copied = document.execCommand('copy');
      ta.remove();
      return copied;
    } catch (_) {
      return false;
    }
  }

  function writeOverwolfFile(targetFile, json, callback) {
    var encoding = (overwolf.io && overwolf.io.enums && overwolf.io.enums.eEncoding && overwolf.io.enums.eEncoding.UTF8) || 'UTF8';
    overwolf.io.writeFileContents(targetFile, json, encoding, false, function (writeRes) {
      if (writeRes && writeRes.success) {
        callback(null, "File saved: " + targetFile);
      } else {
        var err = writeRes && writeRes.error ? writeRes.error : "write error";
        callback(new Error(err), "Could not write the file (" + err + ').');
      }
    });
  }

  function writeToDefaultOverwolfPath(json, callback) {
    var folder = (overwolf.io && overwolf.io.paths && (overwolf.io.paths.desktop || overwolf.io.paths.documents)) || '';
    if (!folder) {
      callback(new Error('No export directory'), "Export folder is unavailable.");
      return;
    }
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
            callback(null, "Export cancelled.");
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
        callback(null, "File download requested.");
        return;
      }
    } catch (_) {}

    callback(new Error('File saving unavailable'), "File saving is unavailable.");
  }

  function saveJsonToFile(json, callback) {
    // 1. Попытка стандартного File System Access API (диалог сохранения файла)
    if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
      window.showSaveFilePicker({
        suggestedName: 'quicktype-connection.json',
        types: [{
          description: "JSON settings file",
          accept: { 'application/json': ['.json'] }
        }]
      }).then(function (handle) {
        return handle.createWritable().then(function (writable) {
          return writable.write(json).then(function () {
            return writable.close();
          });
        });
      }).then(function () {
        callback(null, "File saved.");
      }).catch(function (err) {
        if (err && err.name === 'AbortError') {
          callback(null, "Export cancelled.");
        } else {
          saveOverwolfOrDownload(json, callback);
        }
      });
      return;
    }

    saveOverwolfOrDownload(json, callback);
  }


  document.getElementById('btn-export-connection').addEventListener('click', async function () {
    try {
      var json = exportConnectionProfile(readForm());
      var clipboardResult = copyToClipboard(json);
      if (importText) {
        fileReadVersion++;
        resetImportFileName();
        importText.value = json;
      }
      var result = await new Promise(function (resolve) {
        saveJsonToFile(json, function (err, message) { resolve({ error: err, message: message }); });
      });
      var copied = await clipboardResult;
      if (!copied) {
        importPanel.hidden = false;
        importButton.setAttribute('aria-expanded', 'true');
      }
      transferMessage(result.message + (copied ? " JSON copied to the clipboard." :
        " Could not copy JSON; it is available in the import field."), !result.error);
    } catch (error) {
      transferMessage("Could not export: " + error.message, false);
    }
  });

  function emitLiveConfig() {
    var cfg = readForm();
    updateThemeChips();
    updateSaveState();
    if (typeof overwolf !== 'undefined') {
      overwolf.windows.sendMessage('background', 'preview_config', getOverlayAppearance(cfg), function () {});
    }
  }

  function ensureFontOption(family) {
    if (Object.prototype.hasOwnProperty.call(OVERLAY_FONTS, family)) return;
    var exists = Array.from(overlayFontSelect.options).some(function (option) { return option.value === family; });
    if (exists) return;
    var option = document.createElement('option');
    option.value = family;
    option.textContent = family;
    overlayFontSelect.appendChild(option);
  }

  var fontsStatus = document.getElementById('system-fonts-status');
  var fontsLoading = false;
  var fontsLoaded = false;
  function showFontsStatus(message) {
    setText(fontsStatus, message);
    fitSettingsWindow();
  }

  async function loadSystemFonts() {
    if (fontsLoading || fontsLoaded) return;
    if (typeof window.queryLocalFonts !== 'function') {
      showFontsStatus("This Overwolf version cannot list system fonts. The built-in list is still available.");
      return;
    }
    fontsLoading = true;
    showFontsStatus("Loading system fonts...");
    try {
      var fonts = await window.queryLocalFonts();
      var families = Array.from(new Set(fonts.map(function (font) { return normalizeFontFamily(font.family); }).filter(Boolean)));
      families.sort(function (a, b) { return a.localeCompare(b); });
      var selected = overlayFontSelect.value;
      families.forEach(ensureFontOption);
      overlayFontSelect.value = selected;
      fontsLoaded = families.length > 0;
      showFontsStatus(fontsLoaded ? '' :
        "No system fonts returned. The built-in list is still available.");
    } catch (error) {
      showFontsStatus(error && (error.name === 'NotAllowedError' || error.name === 'SecurityError') ?
        "System font access was not granted. Open the font list to try again." :
        "Could not load system fonts. Open the font list to try again.");
    } finally {
      fontsLoading = false;
    }
  }
  loadSystemFonts();
  // Some browser engines require a user gesture for the first permission prompt.
  overlayFontSelect.addEventListener('pointerdown', loadSystemFonts);
  overlayFontSelect.addEventListener('keydown', function (event) {
    if (event.key === ' ' || event.key === 'ArrowDown' || event.key === 'Enter') loadSystemFonts();
  });

  // Интерактивное обновление ползунка прозрачности
  overlayFontSelect.addEventListener('change', emitLiveConfig);
  overlayFontSizeInput.addEventListener('input', emitLiveConfig);
  overlayFontSizeInput.addEventListener('change', function () {
    overlayFontSizeInput.value = getOverlayFontSize(overlayFontSizeInput.value);
    emitLiveConfig();
  });

  overlayOpacityInput.addEventListener('input', function () {
    if (opacityValueSpan) setText(opacityValueSpan, overlayOpacityInput.value + '%');
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
        if (opacityValueSpan) setText(opacityValueSpan, op + '%');
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
      updateOverlayConfig({ overlayBounds: null, overlayWidth: 640, overlayHeight: 100 });

      if (typeof overwolf !== 'undefined') {
        overwolf.windows.sendMessage('background', 'reset_bounds', {}, function () {});
      }
      showStatus("Window reset (640×100 by default)", true);
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
        showStatus("Invalid headers JSON: " + e.message, false);
        return;
      }
    }

    var success = updateOverlayConfig(cfg);
    if (success) {
      savedForm = JSON.stringify(cfg);
      updateSaveState();
      showStatus("Saved!", true);
      if (typeof overwolf !== 'undefined') {
        overwolf.windows.sendMessage('background', 'config_updated', loadOverlayConfig(), function () {});
      }
    } else {
      showStatus("Could not save settings", false);
    }
  });

  function showStatus(msg, isSuccess) {
    if (statusTimer) clearTimeout(statusTimer);
    setText(saveIndicator, msg);
    saveIndicator.className = 'save-toast ' + (isSuccess ? 'success' : 'error');
    statusTimer = setTimeout(function () {
      setText(saveIndicator, '');
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

  function showTestDetails(type, title, meta, body) {
    if (!testResultBox) return;
    if (btnCloseResult) btnCloseResult.hidden = false;
    testResultBox.style.display = 'block';
    testResultBox.open = type === 'error';
    testResultBox.className = 'test-result-box ' + type;
    setText(resultBoxTitle, title);
    setText(resultBoxMeta, meta);
    setText(resultBoxBody, body);
  }

  // Проверка озвучивания / REST-запроса
  async function performTest() {
    if (btnTestRequest.disabled) return;
    var text = testInput.value.trim();
    if (!text) {
      if (btnCloseResult) btnCloseResult.hidden = false;
      if (resultBadge) resultBadge.style.display = 'none';
      if (testResultBox) testResultBox.style.display = 'none';
      setText(resultStatusText, "Enter text to test.");
      resultStatusText.className = 'status-detail error';
      testInput.focus();
      return;
    }
    var cfg = readForm();

    btnTestRequest.disabled = true;
    if (btnCloseResult) btnCloseResult.hidden = true;
    if (resultBadge) {
      resultBadge.style.display = 'inline-block';
      setText(resultBadge, "Sending...");
      resultBadge.className = 'badge sending';
    }
    setText(resultStatusText, "Sending to " + (cfg.apiUrl || '...') + '...');
    resultStatusText.className = 'status-detail info';
    if (testResultBox) {
      testResultBox.style.display = 'none';
      testResultBox.open = false;
    }

    try {
      var res = await executeRestRequest(cfg, text);

      if (res.ok) {
        if (resultBadge) {
          setText(resultBadge, 'HTTP ' + res.status);
          resultBadge.className = 'badge success';
        }
        setText(resultStatusText, "Service accepted the text · " + res.durationMs + " ms");
        resultStatusText.className = 'status-detail success';

        showTestDetails('success', "Service accepted the text (HTTP " + res.status + '):',
          res.durationMs + " ms", res.body ? formatResponseBody(res.body) : "(Request accepted; response body is empty)");
      } else {
        if (resultBadge) {
          setText(resultBadge, res.status ? ('HTTP ' + res.status) : "Failed");
          resultBadge.className = 'badge error';
        }
        var errorStatusMessage = '';
        if (res.status) {
          var httpReasons = {
            400: "Bad request",
            401: "Authentication required",
            403: "Access denied",
            404: "Endpoint not found. Check the URL",
            405: "Method not allowed",
            408: "Response timed out",
            429: "Too many requests (rate limit)",
            500: "Internal server error",
            502: "Server unavailable (bad gateway)",
            503: "Service temporarily unavailable",
            504: "Gateway timed out"
          };
          var statusDesc = httpReasons[res.status] || (res.statusText && res.statusText !== 'OK' ? res.statusText : (res.status >= 500 ? "Server error" : "Request error"));
          errorStatusMessage = statusDesc + (res.durationMs ? (' · ' + res.durationMs + " ms") : '');
        } else {
          errorStatusMessage = "Could not reach the server. Check the address and whether the service is running";
        }
        setText(resultStatusText, errorStatusMessage);
        resultStatusText.className = 'status-detail error';

        var detailsText = res.body ? formatResponseBody(res.body) :
          res.status ? "(Response body is empty)" : res.error || "The server returned no error details.";
        showTestDetails('error', res.status ? "Server response body:" : "Failure reason:",
          res.durationMs ? (res.durationMs + " ms") : '', detailsText);
      }
    } catch (err) {
      if (resultBadge) {
        setText(resultBadge, "Error");
        resultBadge.className = 'badge error';
      }
      setText(resultStatusText, "Exception: " + err.message);
      resultStatusText.className = 'status-detail error';

      showTestDetails('error', "Execution error:", '', err.message);
      // Configuration errors belong to the request editor, even when it was collapsed.
      requestDetails.open = true;
    } finally {
      btnTestRequest.disabled = false;
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
      btnCloseResult.hidden = true;
      if (testResultBox) testResultBox.style.display = 'none';
      if (resultBadge) {
        resultBadge.style.display = 'none';
        setText(resultBadge, "Ready to test");
        resultBadge.className = 'badge';
      }
      if (resultStatusText) {
        setText(resultStatusText, '');
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
