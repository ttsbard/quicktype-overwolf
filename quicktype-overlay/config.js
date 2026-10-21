/**
 * Конфигурация и утилиты универсального REST Overlay — QuickType
 */
var CONFIG_KEY = 'quicktype_overlay_config';
var BOUNDS_KEY = CONFIG_KEY + '_bounds';
var BOUNDS_FIELDS = ['overlayBounds', 'overlayWidth', 'overlayHeight'];
var REQUEST_TIMEOUT_MS = 15000;
var OVERLAY_APPEARANCE_FIELDS = ['overlayOpacity', 'overlayBgColor', 'showHints', 'overlayFont', 'overlayFontSize'];

function setText(element, text) {
  if (element) element.textContent = text;
}

function setControlAttribute(element, name, value) {
  if (!element) return;
  element.setAttribute(name, value);
  if (name === 'title') element.title = value;
}

function getOverlayAppearance(config) {
  var appearance = {};
  OVERLAY_APPEARANCE_FIELDS.forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(config, key)) appearance[key] = config[key];
  });
  return appearance;
}

var DEFAULT_CONFIG = {
  apiUrl: '',
  httpMethod: 'POST',
  headers: JSON.stringify({
    'Content-Type': 'application/json'
  }, null, 2),
  payloadTemplate: JSON.stringify({
    text: '{text}'
  }, null, 2),
  overlayWidth: 640,
  overlayHeight: 100,
  overlayOpacity: 90,
  overlayBgColor: '#0e0e12',
  overlayFont: 'default',
  overlayFontSize: 18,
  showHints: true,
  overlayBounds: null,
  closeOnSubmit: true,
  clearOnSubmit: true,
  closeOnEscape: true
};

var OVERLAY_FONTS = {
  'default': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  'Arial': 'Arial, sans-serif',
  'Segoe UI': '"Segoe UI", sans-serif',
  'Tahoma': 'Tahoma, sans-serif',
  'Verdana': 'Verdana, sans-serif',
  'Consolas': 'Consolas, monospace',
  'Courier New': '"Courier New", monospace'
};

function getOverlayFontFamily(font) {
  var family = normalizeFontFamily(font);
  if (Object.prototype.hasOwnProperty.call(OVERLAY_FONTS, family)) return OVERLAY_FONTS[family];
  return family ? JSON.stringify(family) + ', sans-serif' : OVERLAY_FONTS.default;
}

function normalizeFontFamily(value) {
  if (typeof value !== 'string') return '';
  var family = value.trim();
  return family && family.length <= 160 && !/[\u0000-\u001f\u007f]/.test(family) ? family : '';
}

function getOverlayFontSize(value) {
  var size = Number(value);
  return isFinite(size) && size > 0 ? Math.max(10, Math.min(48, Math.round(size))) : DEFAULT_CONFIG.overlayFontSize;
}

function loadOverlayConfig() {
  var config = Object.assign({}, DEFAULT_CONFIG);
  [CONFIG_KEY, BOUNDS_KEY].forEach(function (key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
      Object.keys(DEFAULT_CONFIG).forEach(function (field) {
        if ((key !== BOUNDS_KEY || BOUNDS_FIELDS.indexOf(field) !== -1) &&
            Object.prototype.hasOwnProperty.call(parsed, field)) config[field] = parsed[field];
      });
    } catch (error) { console.error("Could not load settings:", error); }
  });
  return config;
}

// Settings and bounds have separate storage records, so their writes cannot
// overwrite each other even when different window contexts save concurrently.
// The original CONFIG_KEY remains readable for existing installations.
function updateOverlayConfig(patch) {
  try {
    var settings = {}, bounds = {}, hasSettings = false, hasBounds = false;
    var latest = loadOverlayConfig();
    Object.keys(DEFAULT_CONFIG).forEach(function (key) {
      var isBounds = BOUNDS_FIELDS.indexOf(key) !== -1;
      var changed = Object.prototype.hasOwnProperty.call(patch, key);
      if (isBounds) {
        bounds[key] = changed ? patch[key] : latest[key];
        // Keep legacy geometry as a fallback until a dedicated bounds record exists.
        settings[key] = latest[key];
        hasBounds = hasBounds || changed;
      } else {
        settings[key] = changed ? patch[key] : latest[key];
        hasSettings = hasSettings || changed;
      }
    });
    if (hasSettings) localStorage.setItem(CONFIG_KEY, JSON.stringify(settings));
    if (hasBounds) localStorage.setItem(BOUNDS_KEY, JSON.stringify(bounds));
    return true;
  } catch (error) {
    console.error("Could not save settings:", error);
    return false;
  }
}

function saveOverlayConfig(config) {
  return updateOverlayConfig(config);
}

function parseRequestHeaders(raw) {
  var headers = raw ? JSON.parse(raw) : {};
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
    throw new Error("Headers must be a JSON object");
  }
  Object.keys(headers).forEach(function (key) {
    if (typeof headers[key] !== 'string') {
      throw new Error("Header " + key + " must have a string value");
    }
  });
  return headers;
}

// Portable connection files deliberately exclude overlay and window preferences.
function parseConnectionProfile(raw) {
  var profile;
  try { profile = JSON.parse(raw.replace(/^\uFEFF/, '')); }
  catch (_) { throw new Error("Invalid JSON. Check quotes, commas and brackets."); }
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error("Connection settings must be a JSON object.");
  }
  var fields = ['apiUrl', 'httpMethod', 'headers', 'payloadTemplate'];
  Object.keys(profile).forEach(function (key) {
    if (fields.indexOf(key) === -1) throw new Error("Unknown field: " + key);
  });
  if (typeof profile.apiUrl !== 'string' || !profile.apiUrl.trim()) {
    throw new Error("Specify apiUrl — the service address.");
  }
  var target;
  try { target = new URL(profile.apiUrl.trim()); }
  catch (_) { throw new Error("apiUrl must be a full URL starting with http:// or https://."); }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new Error("apiUrl must use http or https.");
  }
  var method = profile.httpMethod === undefined ? 'POST' : profile.httpMethod;
  if (typeof method !== 'string' || ['GET', 'POST', 'PUT'].indexOf(method.toUpperCase()) === -1) {
    throw new Error("httpMethod: supported methods are GET, POST and PUT.");
  }
  var headers = profile.headers === undefined ? JSON.parse(DEFAULT_CONFIG.headers) : profile.headers;
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
    throw new Error("headers must be an object with string values.");
  }
  var headersText = JSON.stringify(headers, null, 2);
  parseRequestHeaders(headersText);
  var payload = profile.payloadTemplate === undefined ? JSON.parse(DEFAULT_CONFIG.payloadTemplate) : profile.payloadTemplate;
  if (typeof payload !== 'string' && (!payload || typeof payload !== 'object')) {
    throw new Error("payloadTemplate must be a JSON object, array or string.");
  }
  return { apiUrl: profile.apiUrl.trim(), httpMethod: method.toUpperCase(), headers: headersText,
    payloadTemplate: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2) };
}

function exportConnectionProfile(config) {
  var payload = config.payloadTemplate;
  // Objects and arrays stay readable in exported files; raw text stays a string.
  try {
    var parsed = JSON.parse(payload);
    if (parsed && typeof parsed === 'object') payload = parsed;
  } catch (_) { /* Non-JSON request bodies are supported. */ }
  var profile = { apiUrl: config.apiUrl, httpMethod: config.httpMethod,
    headers: parseRequestHeaders(config.headers), payloadTemplate: payload };
  parseConnectionProfile(JSON.stringify(profile));
  return JSON.stringify(profile, null, 2) + '\n';
}

function isLoopbackAddress(targetUrl) {
  try {
    var hostname = new URL(targetUrl).hostname;
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
  } catch (_) {
    return false;
  }
}

// The deadline covers both response headers and the complete response body.
function withRequestDeadline(operation, onTimeout) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () {
      var error = new Error("Response timed out (15 seconds). The server may have accepted the request; check before retrying.");
      error.name = 'TimeoutError';
      reject(error);
      if (onTimeout) onTimeout();
    }, REQUEST_TIMEOUT_MS);
    Promise.resolve().then(operation).then(function (result) {
      clearTimeout(timer);
      resolve(result);
    }, function (error) {
      clearTimeout(timer);
      reject(error);
    });
  });
}

// Build and validate once, before choosing a transport or starting its deadline.
function prepareRestRequest(config, inputText) {
  var url = (config.apiUrl || '').trim();
  if (!url) throw new Error("Endpoint URL is not configured");
  var method = (config.httpMethod || 'POST').toUpperCase();
  if (['GET', 'POST', 'PUT'].indexOf(method) === -1) {
    throw new Error("Supported methods are GET, POST and PUT");
  }
  var parsedHeaders;
  try {
    parsedHeaders = parseRequestHeaders(config.headers);
  } catch (error) {
    throw new Error("Invalid headers: " + error.message);
  }
  inputText = String(inputText);
  if (method === 'GET' && url.includes('{text}')) {
    url = url.replace(/\{text\}/g, function () { return encodeURIComponent(inputText); });
  }
  var target = new URL(url);
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new Error("URL must use http or https");
  }
  if (method === 'GET' && !(config.apiUrl || '').includes('{text}')) {
    target.searchParams.append('text', inputText);
  }
  url = target.href;
  var bodyString = '';
  if (method !== 'GET') {
    var contentTypeKey = Object.keys(parsedHeaders).find(function (key) { return key.toLowerCase() === 'content-type'; });
    var contentType = contentTypeKey ? parsedHeaders[contentTypeKey].split(';')[0].trim().toLowerCase() : '';
    var isJson = contentType === 'application/json' || contentType.endsWith('+json');
    var template = config.payloadTemplate != null ? config.payloadTemplate : '{"text":"{text}"}';
    var replacement = isJson ? JSON.stringify(inputText).slice(1, -1) : inputText;
    bodyString = template.replace(/\{text\}/g, function () { return replacement; });
    if (isJson) {
      try { JSON.parse(bodyString); }
      catch (error) { throw new Error("The generated request body is not valid JSON: " + error.message); }
    }
  }

  return { url: url, method: method, headers: parsedHeaders, body: bodyString };
}

async function executeRestRequest(config, inputText) {
  var request = prepareRestRequest(config, inputText);
  var url = request.url;
  var method = request.method;
  var parsedHeaders = request.headers;
  var nativeRequest = typeof overwolf !== 'undefined' && overwolf.web &&
    typeof overwolf.web.sendHttpRequest === 'function' && isLoopbackAddress(url);
  var source = nativeRequest ? 'Overwolf Native API' : 'Fetch API';
  var started = performance.now();
  var controller = !nativeRequest && typeof AbortController !== 'undefined' ? new AbortController() : null;
  try {
    return await withRequestDeadline(async function () {
      var status, statusText, body, ok, error;
      if (nativeRequest) {
        var headers = Object.keys(parsedHeaders).map(function (key) { return { key: key, value: parsedHeaders[key] }; });
        var result = await new Promise(function (resolve, reject) {
          try {
            overwolf.web.sendHttpRequest(url, method, headers, request.body, resolve);
          } catch (nativeError) { reject(nativeError); }
        });
        status = result && typeof result.statusCode === 'number' ? result.statusCode : 0;
        ok = !!result && result.success !== false && status >= 200 && status < 300;
        statusText = ok ? 'OK' : 'Error';
        body = result && typeof result.data === 'string' ? result.data : '';
        error = ok ? null : (result && result.error || (status ? "Server returned HTTP " + status : "Could not connect to the local server. Check the address, port and whether it is running."));
      } else {
        var options = { method: method, headers: parsedHeaders };
        if (controller) options.signal = controller.signal;
        if (method !== 'GET') options.body = request.body;
        var response = await fetch(url, options);
        body = await response.text();
        status = response.status;
        statusText = response.statusText;
        ok = response.ok;
        error = ok ? null : "Server returned HTTP " + status + (statusText ? ' ' + statusText : '');
      }
      return { ok: ok, status: status, statusText: statusText, body: body,
        error: error, durationMs: Math.round(performance.now() - started), source: source };
    }, function () { if (controller) controller.abort(); });
  } catch (error) {
    // Never retry automatically: a failed/expired response does not prove non-delivery.
    return { ok: false, status: 0, statusText: error.name === 'TimeoutError' ? 'Timeout' : 'Network Error',
      body: '', durationMs: Math.round(performance.now() - started), source: source,
      error: error.name === 'TimeoutError' ? error.message :
        "Request failed: " + error.message + ". Check the address and server availability" +
        (nativeRequest ? '.' : " and server CORS permissions.") };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DEFAULT_CONFIG: DEFAULT_CONFIG, loadOverlayConfig: loadOverlayConfig,
    saveOverlayConfig: saveOverlayConfig, updateOverlayConfig: updateOverlayConfig,
    parseRequestHeaders: parseRequestHeaders, parseConnectionProfile: parseConnectionProfile,
    exportConnectionProfile: exportConnectionProfile, isLoopbackAddress: isLoopbackAddress,
    executeRestRequest: executeRestRequest };
}
