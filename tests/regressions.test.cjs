const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const http = require('node:http');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = f => fs.readFileSync(path.join(root, f), 'utf8');

function configContext(extra = {}) {
  const values = new Map();
  const c = { console, URL, performance, AbortController, setTimeout, clearTimeout,
    localStorage: { getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, v) }, ...extra };
  vm.createContext(c);
  vm.runInContext(source('quicktype-overlay/config.js'), c);
  vm.runInContext(source('quicktype-overlay/window-geometry.js'), c);
  return c;
}
function uiContext(file, cfg = {}, extra = {}) {
  const elements = new Map(), documentEvents = {}, windowEvents = {}, timers = new Map();
  let nextTimer = 0, ipc;
  const messages = [], dragResizes = [];
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, { value: '', checked: false, disabled: false, readOnly: false, style: { setProperty() {} },
        options: [], appendChild(child) { this.options.push(child); },
        attributes: {}, setAttribute(n, v) { this.attributes[n] = String(v); }, getAttribute(n) { return this.attributes[n]; },
        classList: { add: (...a) => a.forEach(v => classes.add(v)), remove: (...a) => a.forEach(v => classes.delete(v)), contains: v => classes.has(v) },
        focus() {}, setSelectionRange() {}, events: {}, addEventListener(n, f) { this.events[n] = f; } });
    }
    return elements.get(id);
  }
  const c = configContext({
    setTimeout(f, delay) { const id = ++nextTimer; timers.set(id, { f, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    document: { hidden: false, documentElement: element('root'), getElementById: element, querySelectorAll: () => [],
      createElement() { return { value: '', textContent: '' }; },
      addEventListener(n, f) { documentEvents[n] = f; } },
    window: { innerWidth: 800, innerHeight: 250, focus() {}, addEventListener(n, f) { windowEvents[n] = f; } },
    overwolf: { windows: { onMessageReceived: { addListener(f) { ipc = f; } },
      sendMessage(...args) { messages.push(args); const cb = args.at(-1); if (typeof cb === 'function') cb({ success: true }); },
      requestOverlayFocus(id, cb) { assert.equal(id, 'overlay'); cb({ success: true }); },
      getCurrentWindow(cb) { cb({ success: true, window: { id: 'overlay', left: 30, top: 40, width: 800, height: 250 } }); },
      dragMove(id, cb) { cb({ success: true }); }, dragResize(id, edge, rect, cb) { dragResizes.push({ id, edge, rect }); cb({ success: true }); },
      minimize(id, cb) { if (cb) cb({ success: true }); }, close(id, cb) { if (cb) cb({ success: true }); } } }, ...extra
  });
  c.updateOverlayConfig(cfg);
  vm.runInContext(source(file), c);
  documentEvents.DOMContentLoaded();
  return { c, element, messages, timers, windowEvents, dragResizes,
    ipc: m => ipc(m),
    key(key) { element(file.includes('desktop') ? 'testInput' : 'inputText').events.keydown({ key, preventDefault() {}, stopPropagation() {} }); },
    runTimers(delay) { for (const [id, t] of [...timers]) if (t.delay === delay && timers.has(id)) { timers.delete(id); t.f(); } } };
}

function backgroundWindowContext() {
  const calls = [], pending = [], timers = new Map(), held = new Set(), failures = new Set(), errors = [];
  let nextTimer = 0, hotkey, message, nativeVisible = false;
  const windows = {
    onMessageReceived: { addListener(f) { message = f; } }
  };
  for (const name of ['obtainDeclaredWindow', 'getWindowState', 'restore', 'bringToFront',
    'requestOverlayFocus', 'sendMessage', 'minimize']) {
    windows[name] = (...args) => {
      calls.push({ name, args: args.slice(0, -1) });
      const cb = args.at(-1);
      const respond = () => {
        const success = !failures.has(name);
        if (success && name === 'restore') nativeVisible = true;
        if (success && name === 'minimize') nativeVisible = false;
        cb({ success, error: success ? undefined : 'test rejection', window: { id: 'overlay' },
          window_state_ex: nativeVisible ? 'normal' : 'minimized' });
      };
      if (held.has(name)) pending.push({ name, respond });
      else respond();
    };
  }
  const c = configContext({
    console: { log() {}, error(...args) { errors.push(args); }, warn(...args) { errors.push(args); } },
    setTimeout(f, delay) { const id = ++nextTimer; timers.set(id, { f, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    overwolf: {
      windows,
      extensions: { onAppLaunchTriggered: { addListener() {} } },
      settings: { hotkeys: { onPressed: { addListener(f) { hotkey = f; } } } }
    }
  });
  vm.runInContext(source('quicktype-overlay/background.html').match(/<script>([\s\S]*?)<\/script>/)[1], c);
  return { c, calls, pending, held, failures, errors,
    visible: () => nativeVisible,
    key: () => hotkey({ name: 'toggle_input_form' }),
    hide: () => message({ id: 'hide_overlay' }),
    flush(name) { const i = pending.findIndex(p => p.name === name); assert.notEqual(i, -1); pending.splice(i, 1)[0].respond(); },
    runTimers(delay) { for (const [id, t] of [...timers]) if (t.delay === delay && timers.has(id)) { timers.delete(id); t.f(); } }
  };
}

const geometry = require('../quicktype-overlay/window-geometry.js');
function placementApi(extra = {}) {
  const win = { id: 'overlay', monitorId: 'primary', left: 50, top: 50, width: 640, height: 100, dpiScale: 1, ...extra };
  const calls = [];
  const api = { windows: {
    getCurrentWindow(cb) { cb({ success: true, window: { ...win } }); },
    changeSize(options, cb) { calls.push(['size', options.width, options.height]); Object.assign(win, { width: options.width, height: options.height }); cb({ success: true }); },
    changePosition(id, left, top, cb) { calls.push(['position', left, top]); Object.assign(win, { left, top }); cb({ success: true }); }
  }, utils: { getMonitorsList(cb) { cb({ success: true, displays: [{ id: 'primary', x: 0, y: 0, width: 1920, height: 1080, dpiX: 96, is_primary: true }] }); } } };
  return { api, win, calls };
}

test('Geometry retains negative monitor coordinates and recovers disconnected displays', () => {
  const displays = [{ id: 'left', x: -1920, y: 0, width: 1920, height: 1080 },
    { id: 'primary', x: 0, y: 0, width: 1920, height: 1080, is_primary: true }];
  const saved = { left: -1600, top: 100, width: 640, height: 100 };
  assert.equal(geometry.selectDisplay(displays, { monitorId: 'primary' }, saved).id, 'left');
  assert.equal(geometry.selectDisplay(displays.slice(1), { monitorId: 'left' }, saved).id, 'primary');
  const recovered = geometry.fit(saved, { scale: 1, kind: 'desktop', area: { left: 0, top: 0, width: 1920, height: 1040 } });
  assert.equal(recovered.left, 640);
  assert.equal(recovered.top, 470);
});

test('DPI changes retain logical saved dimensions and small areas clamp without double scaling', () => {
  const original = { left: 10, top: 10, width: 640, height: 100, dpiScale: 1 };
  const ctx = { scale: 1.5, kind: 'desktop', area: { left: 0, top: 0, width: 800, height: 500 } };
  const result = geometry.fit(original, ctx);
  assert.equal(result.width, 640); assert.equal(result.height, 100);
  assert.deepEqual(geometry.fit(result, ctx), result);
  const legacy = geometry.fit({ ...original, dpiScale: undefined }, ctx);
  assert.equal(legacy.width, 640);
});

test('Bottom placement uses logical margins and follows changing height', () => {
  const ctx = { scale: 1.5, kind: 'game', area: { left: 0, top: 0, width: 1920, height: 1080 } };
  const first = geometry.fit({ left: 50, top: 50, width: 960, height: 150 }, ctx, { mode: 'bottom', margin: 24 });
  const second = geometry.fit({ ...first, height: 300 }, ctx, { mode: 'bottom', margin: 24 });
  assert.equal(first.left, 480); assert.equal(first.top, 906); assert.equal(second.top, 756);
});

test('Focused game geometry uses its client dimensions instead of desktop monitor origin', () => {
  const p = placementApi();
  p.api.games = { getRunningGameInfo2(cb) { cb({ success: true, gameInfo: { isRunning: true, isInFocus: true, width: 1280, height: 720 } }); } };
  let result;
  geometry.context(p.api, p.win, null, false, ctx => { result = ctx; });
  assert.deepEqual(result.area, { left: 0, top: 0, width: 1280, height: 720 });
  assert.equal(result.kind, 'game');
  geometry.context(p.api, p.win, null, true, ctx => { result = ctx; });
  assert.equal(result.kind, 'desktop');
});

test('Placement passes DPI-aware API positions unchanged and uses logical object size overload', () => {
  const p = placementApi({ dpiScale: 1.5 });
  let result;
  geometry.create(p.api, false).place({ bounds: { left: 300, top: 150, width: 960, height: 180 } }, (r, b) => { result = { r, b }; });
  assert.ok(result.r.success);
  assert.deepEqual(p.calls, [['size', 960, 180], ['position', 300, 150]]);
  assert.equal(result.b.left, 300);
});

test('Failed resize never persists geometry or dispatches a subsequent move', () => {
  const p = placementApi();
  p.api.windows.changeSize = (options, cb) => { cb({ success: false, error: 'denied' }); };
  let result, bounds;
  geometry.create(p.api, false).place({ bounds: { left: 300, top: 200, width: 800, height: 150 } }, (r, b) => { result = r; bounds = b; });
  assert.equal(result.success, false); assert.equal(bounds, undefined); assert.deepEqual(p.calls, []);
});

test('Queued placement serializes native calls and supersedes outdated persistence', () => {
  const p = placementApi(); let finish;
  p.api.windows.changeSize = (options, cb) => { finish = () => { Object.assign(p.win, { width: options.width, height: options.height }); cb({ success: true }); }; };
  const manager = geometry.create(p.api, false), replies = [];
  manager.place({ bounds: { left: 100, top: 100, width: 800, height: 150 } }, r => replies.push(r));
  manager.place({ bounds: { left: 400, top: 200, width: 800, height: 150 } }, r => replies.push(r));
  finish();
  assert.equal(replies[0].cancelled, true); assert.equal(replies[1].success, true);
  assert.deepEqual(p.calls, [['position', 400, 200]]);
});

test('Missing geometry callbacks time out and release the placement queue', () => {
  const c = configContext();
  const timers = new Map(); let i = 0;
  c.setTimeout = (f, delay) => { timers.set(++i, { f, delay }); return i; };
  c.clearTimeout = id => timers.delete(id);
  const p = placementApi(); p.api.windows.changeSize = () => {};
  const replies = [], manager = c.QuickTypeWindows.create(p.api, false);
  manager.place({ bounds: { left: 10, top: 10, width: 800, height: 150 } }, r => replies.push(r));
  for (const t of [...timers.values()]) if (t.delay === 2000) t.f();
  assert.match(replies[0].error, /timed out/);
  manager.place({ bounds: { left: 20, top: 20, width: 640, height: 100 } }, r => replies.push(r));
  assert.equal(replies[1].success, true);
});

test('Placement mode is saved explicitly and never enters portable connection profiles', () => {
  const u = uiContext('quicktype-overlay/desktop.js');
  u.element('overlayPlacement').value = 'bottom'; u.element('overlayMargin').value = '40';
  u.element('overlayPlacement').events.change();
  assert.equal(u.c.loadOverlayConfig().overlayPlacement, 'free');
  u.element('btn-save').events.click();
  assert.equal(u.c.loadOverlayConfig().overlayPlacement, 'bottom');
  assert.equal(u.c.loadOverlayConfig().overlayMargin, 40);
  const profile = JSON.parse(u.c.exportConnectionProfile({ ...u.c.loadOverlayConfig(), apiUrl: 'https://test.example/' }));
  assert.equal(profile.overlayPlacement, undefined); assert.equal(profile.overlayMargin, undefined);
});

test('Late focus IPC cannot activate a hidden overlay or suspend a reopened one', () => {
  let intent = { visible: true, focusAllowed: true };
  const u = uiContext('quicktype-overlay/overlay.js');
  u.c.overwolf.windows.getMainWindow = () => ({ getOverlayIntent: () => intent });
  let focused = 0; u.element('inputText').focus = () => focused++;
  intent = { visible: false, focusAllowed: false };
  u.ipc({ id: 'overlay_hidden' }); u.ipc({ id: 'focus_input_field' }); u.runTimers(45);
  assert.equal(focused, 0);
  intent = { visible: true, focusAllowed: true };
  u.ipc({ id: 'focus_input_field' });
  u.ipc({ id: 'overlay_hidden' }); u.ipc({ id: 'suspend_focus' });
  u.runTimers(45);
  assert.equal(focused, 2);
});

function placedOverlay(cfg = {}, extra = {}) {
  const p = placementApi(extra); let receive;
  const messages = [];
  Object.assign(p.api.windows, {
    onMessageReceived: { addListener(f) { receive = f; } },
    sendMessage(...args) { messages.push(args); const cb = args.at(-1); if (typeof cb === 'function') cb({ success: true }); },
    dragMove(id, cb) { p.win.left = 300; p.win.top = 200; cb({ success: true }); },
    dragResize(id, edge, rect, cb) { p.win.width = 800; p.win.height = 180; cb({ success: true }); }
  });
  const u = uiContext('quicktype-overlay/overlay.js', cfg, { overwolf: p.api });
  return { ...u, ...p, messages, receive: message => receive(message) };
}

test('Anchored overlay follows multiline height, preserves auto sizing and detaches on manual move', () => {
  const u = placedOverlay({ overlayPlacement: 'bottom', overlayMargin: 24 });
  assert.equal(u.win.top, 956);
  u.element('inputText').value = 'one\ntwo'; u.element('inputText').events.input();
  assert.equal(u.win.height, 126); assert.equal(u.win.top, 930);
  u.key('Escape'); u.runTimers(500);
  assert.equal(u.c.loadOverlayConfig().overlayBounds, null);
  u.receive({ id: 'focus_input_field' });
  u.element('hudDrag').events.mousedown({ button: 0, preventDefault() {} });
  assert.equal(u.c.loadOverlayConfig().overlayPlacement, 'free');
  assert.equal(u.c.loadOverlayConfig().overlayBounds.left, 300);
  assert.equal(u.c.loadOverlayConfig().overlayBounds.top, 200);
  assert.ok(u.messages.some(m => m[0] === 'desktop' && m[1] === 'placement_changed'));
});

test('Failed reset retains saved geometry; successful reset centers and restores automatic sizing', () => {
  const cfg = { overlayBounds: { left: 200, top: 100, width: 800, height: 180 }, overlayPlacement: 'free' };
  const u = placedOverlay(cfg);
  const move = u.api.windows.changePosition;
  u.api.windows.changePosition = (id, x, y, cb) => cb({ success: false, error: 'denied' });
  u.receive({ id: 'reset_bounds' });
  assert.equal(u.c.loadOverlayConfig().overlayBounds.width, 800);
  assert.equal(u.messages.at(-1)[2].ok, false);
  u.api.windows.changePosition = move;
  u.receive({ id: 'reset_bounds' });
  assert.equal(u.win.width, 640); assert.equal(u.win.height, 100);
  assert.equal(u.win.left, 640); assert.equal(u.win.top, 490);
  assert.equal(u.c.loadOverlayConfig().overlayBounds, null);
  u.element('inputText').value = 'one\ntwo'; u.element('inputText').events.input();
  assert.equal(u.win.height, 126);
});

test('Controller exclusively owns native focus; DOM activation never requests native input', () => {
  const u = placedOverlay(); let requests = 0;
  u.api.windows.requestOverlayFocus = () => requests++;
  u.receive({ id: 'focus_input_field' }); u.runTimers(15); u.runTimers(45); u.runTimers(100); u.runTimers(200);
  assert.equal(requests, 0);
});

test('Local Escape supersedes in-flight focus IPC before the controller receives hide', () => {
  const u = placedOverlay(); let intent = { visible: true, focusAllowed: true, generation: 1 };
  u.api.windows.getMainWindow = () => ({ getOverlayIntent: () => intent });
  let focused = 0; u.element('inputText').focus = () => focused++;
  u.key('Escape');
  u.receive({ id: 'focus_input_field', content: { generation: 1 } });
  assert.equal(focused, 0);
  intent = { visible: true, focusAllowed: true, generation: 3 };
  u.receive({ id: 'focus_input_field', content: { generation: 1 } });
  assert.equal(focused, 0);
  u.receive({ id: 'focus_input_field', content: { generation: 3 } });
  assert.equal(focused, 1);
});

test('Public monitor dimensions are converted once to logical API space at 150 percent', () => {
  const p = placementApi({ dpiScale: undefined });
  p.api.utils.getMonitorsList = cb => cb({ success: true, displays: [{ id: 'primary', x: 0, y: 0, width: 1920, height: 1080, dpiX: 144, is_primary: true }] });
  let result;
  geometry.context(p.api, p.win, null, false, ctx => { result = ctx; });
  assert.deepEqual(result.area, { left: 0, top: 0, width: 1280, height: 720 });
  assert.equal(geometry.fit(null, result, { center: true }).width, 640);
  const u = geometry.fit({ left: 0, top: 0, width: 640, height: 100 }, result, { mode: 'bottom', margin: 24 });
  assert.equal(u.left, 320); assert.equal(u.top, 596);
});

test('An old restore completing after hide is minimized without restarting focus', () => {
  const b = backgroundWindowContext();
  b.hide(); b.held.add('restore'); b.key();
  const focusCount = b.calls.filter(c => c.name === 'requestOverlayFocus').length;
  b.hide(); b.flush('restore'); b.runTimers(60);
  assert.equal(b.visible(), false);
  assert.equal(b.calls.filter(c => c.name === 'requestOverlayFocus').length, focusCount);
});

test('An old minimize completing after reopen restores the latest visible intent', () => {
  const b = backgroundWindowContext();
  b.held.add('minimize'); b.key(); b.key();
  assert.equal(b.visible(), true);
  b.held.delete('minimize'); b.flush('minimize');
  assert.equal(b.visible(), true);
  assert.equal(b.calls.at(-1).args[1], 'focus_input_field');
});

test('Delayed focus callbacks and fallback timers do not reactivate a dismissed overlay', () => {
  const b = backgroundWindowContext();
  b.hide(); b.held.add('bringToFront'); b.key();
  const messages = b.calls.filter(c => c.name === 'sendMessage' && c.args[1] === 'focus_input_field').length;
  b.hide(); b.runTimers(60); b.flush('bringToFront');
  assert.equal(b.visible(), false);
  assert.equal(b.calls.filter(c => c.name === 'sendMessage' && c.args[1] === 'focus_input_field').length, messages);
});

test('Missing window API callback times out, ignores late focus and allows another hotkey', () => {
  const b = backgroundWindowContext();
  b.hide(); b.held.add('requestOverlayFocus'); b.key();
  b.runTimers(2000);
  assert.ok(b.errors.some(e => String(e).includes('Timed out')));
  const count = b.calls.filter(c => c.name === 'sendMessage' && c.args[1] === 'focus_input_field').length;
  b.flush('requestOverlayFocus');
  assert.equal(b.calls.filter(c => c.name === 'sendMessage' && c.args[1] === 'focus_input_field').length, count);
  b.held.delete('requestOverlayFocus'); b.key(); b.key();
  assert.equal(b.calls.at(-1).args[1], 'focus_input_field');
});

test('Restore failure and focus IPC failure do not lock subsequent window operations', () => {
  const b = backgroundWindowContext();
  b.hide(); b.failures.add('restore'); b.key();
  assert.ok(b.errors.some(e => String(e).includes('restore error')));
  b.failures.delete('restore'); b.key();
  b.hide(); b.failures.add('sendMessage'); b.key();
  assert.ok(b.errors.some(e => String(e).includes('sendMessage error')));
  b.failures.delete('sendMessage'); b.key(); b.key();
  assert.equal(b.calls.at(-1).args[1], 'focus_input_field');
});

test('Hide still minimizes after IPC rejection; unavailable game focus still permits desktop DOM focus', () => {
  const b = backgroundWindowContext();
  b.failures.add('sendMessage'); b.hide();
  assert.equal(b.visible(), false);
  b.failures.delete('sendMessage'); b.failures.add('requestOverlayFocus'); b.key();
  assert.equal(b.calls.at(-1).args[1], 'focus_input_field');
  assert.ok(b.errors.some(e => String(e).includes('requestOverlayFocus unavailable')));
});

test('Reopening cancels old DOM focus timers even if an already queued callback runs', () => {
  const u = uiContext('quicktype-overlay/overlay.js');
  const oldTimers = [...u.timers.values()].filter(t => [15, 45, 100, 200].includes(t.delay));
  let focusCount = 0;
  u.element('inputText').focus = () => { focusCount++; };
  u.key('Escape'); u.ipc({ id: 'focus_input_field' });
  const afterReopen = focusCount;
  oldTimers.forEach(t => t.f());
  assert.equal(focusCount, afterReopen);
  u.runTimers(45);
  assert.equal(focusCount, afterReopen + 1);
  u.key('Escape'); u.runTimers(100);
  assert.equal(focusCount, afterReopen + 1);
});

for (const text of ['$&', "$'", '$`', '$$', 'a"\\\nb', 'Привет 👋']) {
  test('JSON template preserves ' + JSON.stringify(text), async () => {
    let body;
    const c = configContext({ fetch: async (url, opts) => { body = opts.body; return { ok: true, status: 200, statusText: 'OK', text: async () => '{}' }; } });
    const result = await c.executeRestRequest({ ...c.DEFAULT_CONFIG, apiUrl: 'http://127.0.0.1:10101/v1/speech' }, text);
    assert.equal(result.ok, true); assert.equal(JSON.parse(body).text, text);
  });
}
test('Plain text preserves newlines, quotes and dollars', async () => {
  let body;
  const c = configContext({ fetch: async (url, opts) => { body = opts.body; return { ok: true, status: 204, text: async () => '' }; } });
  const text = 'one\n"two"\\$&';
  await c.executeRestRequest({ ...c.DEFAULT_CONFIG, apiUrl: 'http://127.0.0.1:10101/v1/speech', headers: '{"CONTENT-TYPE":"text/plain"}', payloadTemplate: '{text}' }, text);
  assert.equal(body, text);
});
test('GET query is sent before the fragment; placeholders are encoded', async () => {
  const urls = [];
  const c = configContext({ fetch: async url => { urls.push(new URL(url)); return { ok: true, status: 200, text: async () => '' }; } });
  const cfg = { ...c.DEFAULT_CONFIG, httpMethod: 'GET', apiUrl: 'https://example.test/path?existing=1#anchor' };
  await c.executeRestRequest(cfg, 'a & б');
  assert.equal(urls[0].searchParams.get('text'), 'a & б'); assert.equal(urls[0].hash, '#anchor');
  await c.executeRestRequest({ ...cfg, apiUrl: 'https://example.test/?q={text}' }, '$&');
  assert.equal(urls[1].searchParams.get('q'), '$&'); assert.equal(urls[1].searchParams.has('text'), false);
});
test('Invalid header shapes, unsupported methods and URL schemes fail before dispatch', async () => {
  const c = configContext({ fetch: () => { throw Error('Must not dispatch'); } });
  for (const headers of ['null', '[]', '42', '"str"', '{"X":1}']) {
    await assert.rejects(c.executeRestRequest({ ...c.DEFAULT_CONFIG, apiUrl: 'http://127.0.0.1:10101/v1/speech', headers }, 'x'), /headers/);
  }
  await assert.rejects(c.executeRestRequest({ ...c.DEFAULT_CONFIG, apiUrl: 'file:///secret' }, 'x'), /http/);
  await assert.rejects(c.executeRestRequest({ ...c.DEFAULT_CONFIG, apiUrl: 'http://127.0.0.1:10101/v1/speech', httpMethod: 'DELETE' }, 'x'), /GET/);
});
test('IPv6 loopback recognized, misleading host rejected', () => {
  const c = configContext(); assert.equal(c.isLoopbackAddress('http://[::1]:9000'), true);
  assert.equal(c.isLoopbackAddress('http://localhost.evil.test'), false);
  assert.equal(c.isLoopbackAddress('garbage localhost'), false);
});
test('Native timeout ignores late callback without a second dispatch', async () => {
  let callback, count = 0;
  const c = configContext({ setTimeout: (fn, ms) => setTimeout(fn, ms === 15000 ? 15 : ms),
    overwolf: { web: { sendHttpRequest(url, method, headers, body, cb) { callback = cb; count++; } } },
    fetch: () => { throw Error('Unexpected retry'); } });
  const result = await c.executeRestRequest({ ...c.DEFAULT_CONFIG, apiUrl: 'http://127.0.0.1:10101/v1/speech' }, 'test');
  assert.equal(result.statusText, 'Timeout'); callback({ success: true, statusCode: 200 }); assert.equal(count, 1);
});
test('Deadline covers hanging fetch body and aborts transport', async () => {
  let signal;
  const c = configContext({ setTimeout: (fn, ms) => setTimeout(fn, ms === 15000 ? 15 : ms),
    fetch: async (url, opts) => { signal = opts.signal; return { ok: true, status: 200, text: () => new Promise(() => {}) }; } });
  const result = await c.executeRestRequest({ ...c.DEFAULT_CONFIG, apiUrl: 'http://127.0.0.1:10101/v1/speech' }, 'test');
  assert.equal(result.statusText, 'Timeout'); assert.equal(signal.aborted, true);
});
test('Native exceptions are reported without potentially duplicating POST', async () => {
  const c = configContext({ overwolf: { web: { sendHttpRequest() { throw Error('native failed'); } } },
    fetch: () => { throw Error('Unexpected fallback'); } });
  const result = await c.executeRestRequest({ ...c.DEFAULT_CONFIG, apiUrl: 'http://127.0.0.1:10101/v1/speech' }, 'x'); assert.equal(result.ok, false); assert.match(result.error, /native failed/);
});
test('Real local HTTP server receives escaped payload and returns status/body', async t => {
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', b => body += b); req.on('end', () => { res.writeHead(201, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ text: JSON.parse(body).text })); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const c = configContext({ fetch });
  const result = await c.executeRestRequest({ ...c.DEFAULT_CONFIG, apiUrl: 'http://127.0.0.1:' + server.address().port }, '$&\nПривет');
  assert.equal(result.status, 201); assert.equal(JSON.parse(result.body).text, '$&\nПривет');
});

test('Reopening preserves drafts and pending lock; duplicate Enter dispatches once', () => {
  const u = uiContext('quicktype-overlay/overlay.js');
  u.element('inputText').value = 'draft'; u.ipc({ id: 'focus_input_field' }); assert.equal(u.element('inputText').value, 'draft');
  u.key('Enter'); u.ipc({ id: 'focus_input_field' }); u.key('Enter');
  assert.equal(u.element('inputText').readOnly, true);
  assert.equal(u.messages.filter(m => m[1] === 'submit_text').length, 1);
});
test('Dismissed response cannot clear or hide a subsequent submission', () => {
  const u = uiContext('quicktype-overlay/overlay.js');
  u.element('inputText').value = 'first'; u.key('Enter');
  const first = u.messages.find(m => m[1] === 'submit_text')[2].requestId;
  u.key('Escape'); u.ipc({ id: 'focus_input_field' });
  u.element('inputText').value = 'second'; u.key('Enter');
  const second = u.messages.filter(m => m[1] === 'submit_text')[1][2].requestId;
  u.ipc({ id: 'rest_result', content: { ok: true, requestId: first } }); u.runTimers(350);
  assert.equal(u.element('inputText').value, 'second'); assert.equal(u.element('inputText').readOnly, true);
  u.ipc({ id: 'rest_result', content: { ok: false, requestId: second, error: 'failed' } });
  assert.equal(u.element('inputText').value, 'second'); assert.equal(u.element('inputText').readOnly, false);
});
test('Hotkey hide invalidates pending result and success timer', () => {
  const u = uiContext('quicktype-overlay/overlay.js'); u.element('inputText').value = 'first'; u.key('Enter');
  const id = u.messages.find(m => m[1] === 'submit_text')[2].requestId;
  u.ipc({ id: 'rest_result', content: { ok: true, requestId: id } });
  u.ipc({ id: 'overlay_hidden' }); u.ipc({ id: 'focus_input_field' }); u.element('inputText').value = 'new';
  u.runTimers(350); assert.equal(u.element('inputText').value, 'new'); assert.equal(u.messages.filter(m => m[1] === 'hide_overlay').length, 0);
});
test('Escape flag and success preferences are respected', () => {
  const u = uiContext('quicktype-overlay/overlay.js', { closeOnEscape: false, clearOnSubmit: false, closeOnSubmit: false });
  u.key('Escape'); assert.equal(u.messages.length, 0);
  u.element('inputText').value = 'keep'; u.key('Enter');
  const id = u.messages.find(m => m[1] === 'submit_text')[2].requestId;
  u.ipc({ id: 'rest_result', content: { ok: true, requestId: id } }); u.runTimers(350);
  assert.equal(u.element('inputText').value, 'keep'); assert.equal(u.element('inputText').readOnly, false);
  assert.equal(u.messages.filter(m => m[1] === 'hide_overlay').length, 0);
});
test('Live preview accepts appearance without changing saved API settings', () => {
  const u = uiContext('quicktype-overlay/overlay.js');
  const saved = u.c.loadOverlayConfig().apiUrl;
  u.ipc({ id: 'preview_config', content: { overlayOpacity: 20, showHints: false, apiUrl: 'https://bad.test' } });
  assert.equal(u.element('hudFooter').classList.contains('hidden'), true); assert.equal(u.c.loadOverlayConfig().apiUrl, saved);
  u.ipc({ id: 'config_updated', content: u.c.loadOverlayConfig() }); assert.equal(u.element('hudFooter').classList.contains('hidden'), false);
});
test('Desktop Save retains independently updated bounds; resize retains API settings', () => {
  const d = uiContext('quicktype-overlay/desktop.js');
  d.c.updateOverlayConfig({ overlayBounds: { left: 10, top: 20, width: 900, height: 300 }, overlayWidth: 900, overlayHeight: 300 });
  d.element('btn-save').events.click(); assert.equal(d.c.loadOverlayConfig().overlayWidth, 900);
  const u = uiContext('quicktype-overlay/overlay.js'); u.c.updateOverlayConfig({ apiUrl: 'https://new.test/' });
  u.windowEvents.resize(); u.runTimers(500); assert.equal(u.c.loadOverlayConfig().apiUrl, 'https://new.test/'); assert.equal(u.c.loadOverlayConfig().overlayWidth, 800);
});
test('Desktop preview sends only appearance; repeated Enter tests are blocked', async () => {
  let resolve, count = 0;
  const d = uiContext('quicktype-overlay/desktop.js');
  d.element('testInput').value = 'Проверка';
  d.c.executeRestRequest = () => { count++; return new Promise(r => resolve = r); };
  d.element('overlayOpacity').value = '20'; d.element('overlayOpacity').events.input();
  const message = d.messages.at(-1); assert.equal(message[1], 'preview_config'); assert.equal(message[2].overlayOpacity, 20); assert.equal(message[2].apiUrl, undefined);
  d.key('Enter'); d.key('Enter'); assert.equal(count, 1);
  resolve({ ok: true, status: 200, durationMs: 1, body: '' }); await new Promise(r => setImmediate(r)); assert.equal(d.element('btn-test-request').disabled, false);
});

test('GamesList corrects values before ID, leaves other games alone and is idempotent', () => {
  const { patchGameList } = require('../scripts/patch-overwolf-gamelist.js');
  const fixture = '<Games><GameInfo><ControlModes>AllowMixedMode</ControlModes><DisableSmartMixMode>False</DisableSmartMixMode><ID>221561</ID></GameInfo><GameInfo><ID>123</ID><ControlModes>Keep</ControlModes></GameInfo></Games>';
  const result = patchGameList(fixture, '221561');
  assert.equal(result.changed, true); assert.match(result.content, /<DisableSmartMixMode>True<\/DisableSmartMixMode>/);
  assert.match(result.content, /<ControlModes>NotAllowMixedMode<\/ControlModes>/); assert.match(result.content, /<ControlModes>Keep<\/ControlModes>/);
  assert.equal(patchGameList(result.content, '221561').changed, false); assert.equal(patchGameList(fixture, '999').found, false);
  assert.throws(() => patchGameList(fixture, '1<'), /digits/);
});
test('GamesList supports XML output larger than the child process default buffer', () => {
  const { patchGameList, validateXml } = require('../scripts/patch-overwolf-gamelist.js');
  const padding = 'x'.repeat(2 * 1024 * 1024);
  const fixture = '<Games><!--' + padding + '--><GameInfo><ID>221561</ID></GameInfo></Games>';
  const result = patchGameList(fixture, '221561');
  assert.equal(result.found, true);
  assert.equal(result.changed, true);
  assert.ok(result.content.includes('<!--' + padding + '-->'));
  assert.match(result.content, /<DisableSmartMixMode>True<\/DisableSmartMixMode>/);
  validateXml(result.content);
});

test('GamesList rejects duplicates and validates XML without touching installed cache', () => {
  const { patchGameList, validateXml } = require('../scripts/patch-overwolf-gamelist.js');
  assert.throws(() => patchGameList('<Games><GameInfo><ID>1</ID><ControlModes>A</ControlModes><ControlModes>B</ControlModes></GameInfo></Games>', '1'), /Duplicate/);
  if (process.platform === 'win32') { validateXml('<Games><GameInfo><ID>1</ID></GameInfo></Games>'); assert.throws(() => validateXml('<Games>')); }
});
test('Sources parse; manifest and HTML resource references exist; Markdown links resolve', () => {
  for (const f of ['config.js', 'window-geometry.js', 'desktop.js', 'overlay.js']) new vm.Script(source('quicktype-overlay/' + f));
  const manifest = JSON.parse(source('quicktype-overlay/manifest.json'));
  assert.equal(manifest.data.start_window, 'background'); assert.ok(manifest.permissions.includes('Web'));
  assert.ok(manifest.data.hotkeys[manifest.data.windows.overlay.focus_game_takeover_release_hotkey]);
  for (const w of Object.values(manifest.data.windows)) assert.ok(fs.existsSync(path.join(root, 'quicktype-overlay', w.file)));
  for (const f of ['background.html', 'desktop.html', 'overlay.html']) {
    const html = source('quicktype-overlay/' + f);
    for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(m[1]);
    for (const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)) assert.ok(fs.existsSync(path.join(root, 'quicktype-overlay', m[1])), m[1]);
  }
  function check(file) { for (const m of source(file).matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) if (!/^(https?:|#)/.test(m[1])) assert.ok(fs.existsSync(path.resolve(root, path.dirname(file), m[1].split('#')[0])), file + ': ' + m[1]); }
  function walk(dir) { for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.md')) check(p); } }
  walk('docs'); check('README.md'); check('CHANGELOG.md');
});

test('Legacy configuration survives settings migration and concurrent geometry writes', () => {
  const c = configContext();
  c.localStorage.setItem(c.CONFIG_KEY, JSON.stringify({ ...c.DEFAULT_CONFIG, overlayWidth: 950,
    overlayBounds: { left: 1, top: 2, width: 950, height: 300 } }));
  c.updateOverlayConfig({ apiUrl: 'https://new.test/' }); assert.equal(c.loadOverlayConfig().overlayWidth, 950);
  // Simulate another window writing geometry after desktop read its snapshot.
  const originalSet = c.localStorage.setItem; let interleaved = false;
  c.localStorage.setItem = (key, value) => {
    if (key === c.CONFIG_KEY && !interleaved) { interleaved = true; c.updateOverlayConfig({ overlayWidth: 1200 }); }
    originalSet(key, value);
  };
  c.updateOverlayConfig({ apiUrl: 'https://latest.test/' });
  assert.equal(c.loadOverlayConfig().overlayWidth, 1200); assert.equal(c.loadOverlayConfig().apiUrl, 'https://latest.test/');
});
test('Missing IPC reply unlocks input without deleting the draft', () => {
  const u = uiContext('quicktype-overlay/overlay.js'); u.element('inputText').value = 'pending'; u.key('Enter');
  u.runTimers(16000); assert.equal(u.element('inputText').readOnly, false); assert.equal(u.element('inputText').value, 'pending');
  assert.match(u.element('hudStatusText').textContent, /controller/);
});
test('Background forwards preview and request IDs using saved config', async () => {
  let listener; const sent = []; let submitted;
  const c = configContext({ setTimeout() {}, overwolf: {
    extensions: { onAppLaunchTriggered: { addListener() {} } }, settings: { hotkeys: { onPressed: { addListener() {} } } },
    windows: { onMessageReceived: { addListener(f) { listener = f; } },
      obtainDeclaredWindow(name, cb) { cb({ success: true, window: { id: name } }); },
      restore(id, cb) { cb({ success: true }); }, bringToFront() {},
      sendMessage(...args) { sent.push(args); }, minimize(id, cb) { cb({ success: true }); } }
  } });
  c.executeRestRequest = async (cfg, text) => { submitted = { cfg, text }; return { ok: true, status: 201, durationMs: 1 }; };
  vm.runInContext(source('quicktype-overlay/background.html').match(/<script>([\s\S]*?)<\/script>/)[1], c);
  listener({ id: 'preview_config', content: { overlayOpacity: 20 } }); assert.equal(sent.at(-1)[1], 'preview_config');
  c.updateOverlayConfig({ apiUrl: 'https://saved.test/' });
  listener({ id: 'submit_text', content: { text: 'hello', requestId: 'r1' } });
  await new Promise(r => setImmediate(r));
  assert.equal(submitted.cfg.apiUrl, 'https://saved.test/'); assert.equal(sent.at(-1)[2].requestId, 'r1');
  c.executeRestRequest = async () => ({ ok: false, error: 'failed' });
  listener({ id: 'submit_text', content: { text: 'hello', requestId: 'r2' } });
  await new Promise(r => setImmediate(r)); assert.equal(sent.at(-1)[2].requestId, 'r2'); assert.equal(sent.at(-1)[2].ok, false);
  listener({ id: 'hide_overlay' }); assert.equal(sent.at(-1)[1], 'overlay_hidden');
});
test('Startup and hub launch open input; settings remain reachable without losing the draft', () => {
  let launch, message;
  const restored = [], focused = [];
  const c = configContext({ setTimeout() { return 1; }, overwolf: {
    extensions: { onAppLaunchTriggered: { addListener(f) { launch = f; } } },
    settings: { hotkeys: { onPressed: { addListener() {} } } },
    windows: {
      onMessageReceived: { addListener(f) { message = f; } },
      obtainDeclaredWindow(name, cb) { cb({ success: true, window: { id: name } }); },
      restore(id, cb) { restored.push(id); cb({ success: true }); },
      bringToFront(id, focus, cb) { cb({ success: true }); },
      requestOverlayFocus(id, cb) { focused.push(id); cb({ success: true }); },
      sendMessage(id, name, content, cb) { cb({ success: true }); }
    }
  } });
  vm.runInContext(source('quicktype-overlay/background.html').match(/<script>([\s\S]*?)<\/script>/)[1], c);
  assert.deepEqual(restored, ['overlay']);
  launch({ origin: 'dock' });
  assert.deepEqual(restored, ['overlay', 'overlay']);
  assert.deepEqual(focused, ['overlay', 'overlay']);
  const u = uiContext('quicktype-overlay/overlay.js', { showHints: false });
  u.element('inputText').value = 'Черновик';
  u.element('btn-open-settings').events.click();
  const request = u.messages.at(-1);
  assert.equal(request[0], 'background');
  assert.equal(request[1], 'open_settings');
  message({ id: request[1] });
  assert.equal(restored.at(-1), 'desktop');
  assert.equal(u.element('inputText').value, 'Черновик');
  assert.equal(JSON.parse(source('quicktype-overlay/manifest.json')).data.windows.overlay.in_game_only, false);
});

test('XML parser ignores comments, preserves Unicode and rejects DTD', () => {
  const { patchGameList, validateXml } = require('../scripts/patch-overwolf-gamelist.js');
  const fixture = '<Games><!-- <GameInfo><ID>1</ID></GameInfo> --><GameInfo><ID>1</ID><Name>Привет</Name><DisableSmartMixMode/></GameInfo></Games>';
  const result = patchGameList(fixture, '1'); assert.match(result.content, /Привет/); assert.match(result.content, /<DisableSmartMixMode>True/);
  validateXml(result.content); assert.throws(() => validateXml('<!DOCTYPE Games [<!ENTITY x "value">]><Games>&x;</Games>'));
});

test('All 8 edge and corner resize handles trigger overwolf dragResize with proper edges', () => {
  const u = uiContext('quicktype-overlay/overlay.js');
  const handles = [
    { id: 'hudResizeTop', edge: 'Top' },
    { id: 'hudResizeBottom', edge: 'Bottom' },
    { id: 'hudResizeLeft', edge: 'Left' },
    { id: 'hudResizeRight', edge: 'Right' },
    { id: 'hudResizeTopLeft', edge: 'TopLeft' },
    { id: 'hudResizeTopRight', edge: 'TopRight' },
    { id: 'hudResizeBottomLeft', edge: 'BottomLeft' },
    { id: 'hudResizeGrip', edge: 'BottomRight' }
  ];

  for (const h of handles) {
    const el = u.element(h.id);
    assert.ok(el.events.mousedown, 'Mousedown handler registered for ' + h.id);
    el.events.mousedown({ button: 0, preventDefault() {}, stopPropagation() {} });
  }

  assert.equal(u.dragResizes.length, 8);
  for (let i = 0; i < handles.length; i++) {
    assert.equal(u.dragResizes[i].id, 'overlay');
    assert.equal(u.dragResizes[i].edge, handles[i].edge);
    assert.deepEqual({ ...u.dragResizes[i].rect }, { left: 0, top: 0, width: 800, height: 250 });
  }
});

test('Submitting and success do not show banners or highlight borders; only error shows text without red outline', () => {
  const u = uiContext('quicktype-overlay/overlay.js');
  const banner = u.element('hudStatusBanner');
  const container = u.element('hudContainer');
  const input = u.element('inputText');

  input.value = 'hello';
  u.key('Enter');

  // During submit: no banner, no glowing outline
  assert.equal(banner.style.display, 'none');
  assert.equal(u.element('hudStatusText').textContent, '');
  assert.equal(container.classList.contains('status-sending'), false);

  const reqId = u.messages.find(m => m[1] === 'submit_text')[2].requestId;

  // On success: no banner, no glowing outline
  u.ipc({ id: 'rest_result', content: { ok: true, requestId: reqId } });
  assert.equal(banner.style.display, 'none');
  assert.equal(u.element('hudStatusText').textContent, '');
  assert.equal(container.classList.contains('status-success'), false);
  u.runTimers(350);

  // Next request with error:
  input.value = 'will fail';
  u.key('Enter');
  const reqId2 = u.messages.filter(m => m[1] === 'submit_text')[1][2].requestId;
  u.ipc({ id: 'rest_result', content: { ok: false, requestId: reqId2, error: 'Ошибка 500' } });

  // On error: only error text, no red outline on container
  assert.equal(banner.style.display, 'flex');
  assert.equal(u.element('hudStatusText').textContent, 'Ошибка 500');
  assert.equal(container.classList.contains('status-error'), false);

  // Typing clears the error
  input.events.input();
  assert.equal(banner.style.display, 'none');
  assert.equal(u.element('hudStatusText').textContent, '');
});

test('Header close preserves the draft; error dismiss preserves text and permits retry', () => {
  const u = uiContext('quicktype-overlay/overlay.js', { closeOnEscape: false });
  const input = u.element('inputText');
  input.value = 'Черновик';
  u.key('Enter');
  const request = u.messages.find(m => m[1] === 'submit_text')[2];
  u.ipc({ id: 'rest_result', content: { ok: false, requestId: request.requestId, error: "Error" } });
  assert.equal(u.element('btn-close-error').hidden, false);
  u.element('btn-close-error').events.click();
  assert.equal(u.element('hudStatusBanner').style.display, 'none');
  assert.equal(u.element('btn-close-error').hidden, true);
  assert.equal(input.value, 'Черновик');
  u.key('Enter');
  assert.equal(u.messages.filter(m => m[1] === 'submit_text').length, 2);
  u.element('btn-close-overlay').events.click();
  assert.equal(u.messages.at(-1)[1], 'hide_overlay');
  assert.equal(input.value, 'Черновик');
});

test('Overlay typography previews without saving, persists on Save and restores on reopen', () => {
  const d = uiContext('quicktype-overlay/desktop.js');
  d.element('overlayFont').value = 'Consolas';
  d.element('overlayFont').events.change();
  d.element('overlayFontSize').value = '24';
  d.element('overlayFontSize').events.input();
  assert.equal(d.element('dirty-indicator').textContent, "Preview applied · click Save");
  assert.equal(d.c.loadOverlayConfig().overlayFontSize, 18);
  const preview = d.messages.at(-1)[2];
  const u = uiContext('quicktype-overlay/overlay.js');
  u.ipc({ id: 'preview_config', content: preview });
  assert.equal(u.element('inputText').style.fontFamily, 'Consolas, monospace');
  assert.equal(u.element('inputText').style.fontSize, '24px');
  d.element('btn-save').events.click();
  const saved = d.c.loadOverlayConfig();
  assert.equal(saved.overlayFont, 'Consolas');
  assert.equal(saved.overlayFontSize, 24);
  assert.equal(d.element('dirty-indicator').textContent, "All changes saved");
  const reopened = uiContext('quicktype-overlay/desktop.js', saved);
  assert.equal(reopened.element('overlayFont').value, 'Consolas');
  assert.equal(Number(reopened.element('overlayFontSize').value), 24);
  const restored = uiContext('quicktype-overlay/overlay.js', saved);
  assert.equal(restored.element('inputText').style.fontSize, '24px');
  assert.equal(d.c.getOverlayFontSize(999), 48);
  assert.equal(d.c.getOverlayFontSize(1), 10);
  assert.equal(d.c.getOverlayFontSize('invalid'), 18);
  assert.equal(d.c.getOverlayFontFamily(null), d.c.OVERLAY_FONTS.default);
});

test('Native color picker applies the selected color without saving until Save', () => {
  assert.match(source('quicktype-overlay/desktop.html'), /type="color" id="overlayBgColor"/);
  const d = uiContext('quicktype-overlay/desktop.js');
  d.element('overlayBgColor').value = '#ffffff';
  d.element('overlayBgColor').events.input();
  assert.equal(d.messages.at(-1)[2].overlayBgColor, '#ffffff');
  assert.equal(d.c.loadOverlayConfig().overlayBgColor, '#0e0e12');
  d.element('btn-save').events.click();
  assert.equal(d.c.loadOverlayConfig().overlayBgColor, '#ffffff');
});

test('White overlay uses light appearance and returns to dark appearance on color change', () => {
  const u = uiContext('quicktype-overlay/overlay.js', { overlayBgColor: '#ffffff' });
  assert.equal(u.element('hudContainer').classList.contains('hud-light'), true);
  u.ipc({ id: 'preview_config', content: { overlayBgColor: '#0e0e12' } });
  assert.equal(u.element('hudContainer').classList.contains('hud-light'), false);
});

test('Desktop test response close button hides testResultBox and resets status badge', async () => {
  let resolve;
  const d = uiContext('quicktype-overlay/desktop.js');
  d.element('testInput').value = 'Проверка';
  d.c.executeRestRequest = () => new Promise(r => resolve = r);
  d.element('btn-test-request').events.click();
  resolve({ ok: true, status: 200, durationMs: 12, body: '{"ok":true}' });
  await new Promise(r => setImmediate(r));

  const box = d.element('testResultBox');
  const badge = d.element('resultBadge');
  assert.equal(box.style.display, 'block');
  assert.equal(badge.textContent, 'HTTP 200');

  // Click close button
  d.element('btn-close-result').events.click();
  assert.equal(box.style.display, 'none');
  assert.equal(badge.textContent, "Ready to test");
  assert.equal(d.element('resultStatusText').textContent, '');
});

test('Desktop fits overlay settings, restores connection height and ignores stale sizing callbacks', () => {
  const d = uiContext('quicktype-overlay/desktop.js');
  const win = { id: 'desktop', width: 600, height: 750 };
  const frames = [], replies = [], sizes = [];
  let panelHeight = 580;
  const main = {};
  Object.defineProperty(main, 'clientHeight', { get: () => win.height - 127 });
  d.c.document.querySelector = () => main;
  d.element('panel-overlay').getBoundingClientRect = () => ({ height: panelHeight });
  d.c.window.getComputedStyle = () => ({ paddingTop: '12px', paddingBottom: '6px' });
  d.c.window.requestAnimationFrame = callback => frames.push(callback);
  d.c.overwolf.windows.getCurrentWindow = callback => replies.push(callback);
  d.c.overwolf.windows.changeSize = (id, width, height, callback) => {
    assert.equal(id, 'desktop');
    sizes.push(height);
    Object.assign(win, { width, height });
    callback({ success: true });
  };
  function finishFit() {
    frames.shift()();
    replies.shift()({ success: true, window: { ...win } });
  }
  d.element('tab-overlay').events.click();
  frames.shift()();
  d.element('tab-connection').events.click();
  replies.shift()({ success: true, window: { ...win } });
  assert.deepEqual(sizes, []);
  finishFit();
  d.element('tab-overlay').events.click(); finishFit();
  assert.equal(win.height, 725);
  panelHeight = 600;
  d.element('overlayFont').events.pointerdown(); finishFit();
  assert.equal(win.height, 745);
  d.element('tab-connection').events.click(); finishFit();
  assert.equal(win.height, 750);
});

test('Desktop titlebar minimize and close buttons call overwolf.windows methods', () => {
  let minimized = false, closed = false;
  const d = uiContext('quicktype-overlay/desktop.js', {}, {
    overwolf: {
      windows: {
        getCurrentWindow(cb) { cb({ success: true, window: { id: 'desktop' } }); },
        minimize(id) { if (id === 'desktop') minimized = true; },
        close(id) { if (id === 'desktop') closed = true; }
      }
    }
  });

  d.element('btnWindowMinimize').events.click();
  assert.equal(minimized, true);

  d.element('btnWindowClose').events.click();
  assert.equal(closed, true);
});

test('Desktop appearance changes stay unsaved until Save and reverting clears dirty state', () => {
  const d = uiContext('quicktype-overlay/desktop.js');
  assert.equal(d.element('btn-save').disabled, true);
  d.element('overlayOpacity').value = '65';
  d.element('overlayOpacity').events.input();
  assert.equal(d.element('btn-save').disabled, false);
  assert.equal(d.c.loadOverlayConfig().overlayOpacity, 90);
  assert.equal(d.messages.at(-1)[2].overlayOpacity, 65);
  d.element('overlayOpacity').value = '90';
  d.element('overlayOpacity').events.input();
  assert.equal(d.element('btn-save').disabled, true);
  d.element('showHints').checked = false;
  d.element('showHints').events.change();
  assert.equal(d.messages.at(-1)[2].showHints, false);
  d.element('btn-save').events.click();
  assert.equal(d.c.loadOverlayConfig().showHints, false);
  assert.equal(d.element('btn-save').disabled, true);
});

test('Desktop system theme follows OS changes independently of saved overlay appearance', () => {
  let changed;
  const media = { matches: false, addEventListener(name, fn) { changed = fn; } };
  const d = uiContext('quicktype-overlay/desktop.js', {}, {
    window: { matchMedia: () => media }
  });
  assert.equal(d.element('root').attributes['data-theme'], 'dark');
  media.matches = true;
  changed();
  assert.equal(d.element('root').attributes['data-theme'], 'light');
  d.element('appTheme').value = 'dark';
  d.element('appTheme').events.change();
  changed();
  assert.equal(d.element('root').attributes['data-theme'], 'dark');
  assert.equal(d.c.localStorage.getItem('quicktype_desktop_theme'), 'dark');
  assert.equal(d.c.loadOverlayConfig().overlayBgColor, '#0e0e12');
  assert.equal(d.element('btn-save').disabled, true);
});

test('Desktop theme toggle button toggles between dark and light themes', () => {
  const d = uiContext('quicktype-overlay/desktop.js');
  assert.equal(d.element('root').attributes['data-theme'], 'dark');
  assert.equal(d.element('themeToggleBtn').title, "Switch to light theme");
  d.element('themeToggleBtn').events.click();
  assert.equal(d.element('root').attributes['data-theme'], 'light');
  assert.equal(d.element('themeToggleBtn').title, "Switch to dark theme");
  assert.equal(d.c.localStorage.getItem('quicktype_desktop_theme'), 'light');
  d.element('themeToggleBtn').events.click();
  assert.equal(d.element('root').attributes['data-theme'], 'dark');
  assert.equal(d.element('themeToggleBtn').title, "Switch to light theme");
  assert.equal(d.c.localStorage.getItem('quicktype_desktop_theme'), 'dark');
});

test('Desktop invalid headers reveal their editor from the overlay tab and preserve saved settings', () => {
  const d = uiContext('quicktype-overlay/desktop.js');
  d.element('tab-overlay').events.click();
  assert.equal(d.element('panel-connection').hidden, true);
  d.element('headers').value = '{bad';
  d.element('btn-save').events.click();
  assert.equal(d.element('panel-connection').hidden, false);
  assert.equal(d.element('tab-connection').attributes['aria-selected'], 'true');
  assert.equal(d.element('requestDetails').open, true);
  assert.match(d.element('save-indicator').textContent, /Invalid headers JSON/);
  assert.doesNotThrow(() => JSON.parse(d.c.loadOverlayConfig().headers));
});

test('Desktop response details collapse on success and open on HTTP failure', async () => {
  const d = uiContext('quicktype-overlay/desktop.js');
  d.element('testInput').value = 'Проверка';
  d.c.executeRestRequest = async () => ({ ok: true, status: 204, durationMs: 12, body: '' });
  await d.element('btn-test-request').events.click();
  assert.equal(d.element('testResultBox').open, false);
  d.c.executeRestRequest = async () => ({ ok: false, status: 400, durationMs: 15, body: 'Bad request' });
  await d.element('btn-test-request').events.click();
  assert.equal(d.element('testResultBox').open, true);
  assert.equal(d.element('resultBoxBody').textContent, 'Bad request');
  d.c.executeRestRequest = async () => ({ ok: false, status: 404, durationMs: 20, body: '', error: 'Сервер вернул HTTP 404' });
  await d.element('btn-test-request').events.click();
  assert.match(d.element('resultStatusText').textContent, /Endpoint not found/);
  assert.equal(d.element('resultBoxBody').textContent, "(Response body is empty)");
});

test('Portable connections round trip JSON and text bodies without overlay settings', () => {
  const c = configContext();
  for (const payload of ['{"text":"{text}","voice":"Алёна"}', 'say {text}\nnext', '"literal"', '["{text}"]', '']) {
    const cfg = { ...c.DEFAULT_CONFIG, apiUrl: 'http://127.0.0.1:10101/v1/speech', payloadTemplate: payload };
    const exported = c.exportConnectionProfile(cfg);
    const profile = JSON.parse(exported);
    assert.deepEqual(Object.keys(profile).sort(), ['apiUrl', 'headers', 'httpMethod', 'payloadTemplate']);
    assert.equal(typeof profile.headers, 'object');
    const restored = c.parseConnectionProfile(exported);
    if (typeof profile.payloadTemplate === 'object') assert.deepEqual(JSON.parse(restored.payloadTemplate), JSON.parse(payload));
    else assert.equal(restored.payloadTemplate, payload);
    assert.equal(restored.apiUrl, cfg.apiUrl);
  }
});

test('Connection import defaults omitted fields and rejects malformed values', () => {
  const c = configContext();
  const minimal = c.parseConnectionProfile('\uFEFF{"apiUrl":"http://localhost:10101/v1/speech"}');
  assert.equal(minimal.httpMethod, 'POST');
  assert.deepEqual(JSON.parse(minimal.headers), { 'Content-Type': 'application/json' });
  const base = { apiUrl: 'https://example.com/hook' };
  for (const value of [null, [], {}, { ...base, apiUrl: 'file:///secret' },
    { ...base, httpMethod: 'DELETE' }, { ...base, headers: [] }, { ...base, headers: { Auth: 3 } },
    { ...base, payloadTemplate: null }, { ...base, overlayOpacity: 80 }]) {
    assert.throws(() => c.parseConnectionProfile(JSON.stringify(value)));
  }
  assert.throws(() => c.parseConnectionProfile('{bad'));
});

test('Desktop import is atomic, preserves overlay preferences and waits for Save', () => {
  const d = uiContext('quicktype-overlay/desktop.js', { overlayOpacity: 75 }, { Blob });
  const before = d.c.localStorage.getItem('quicktype_overlay_config');
  d.element('connectionJson').value = '{"apiUrl":"https://example.com/hook","headers":{"Auth":3}}';
  d.element('btn-apply-connection').events.click();
  assert.equal(d.element('apiUrl').value, d.c.DEFAULT_CONFIG.apiUrl);
  assert.match(d.element('connection-transfer-status').textContent, /Auth/);
  d.element('connectionJson').value = '{"apiUrl":"https://example.com/hook","httpMethod":"get"}';
  d.element('btn-apply-connection').events.click();
  assert.equal(d.element('apiUrl').value, 'https://example.com/hook');
  assert.equal(d.element('httpMethod').value, 'GET');
  assert.equal(d.element('overlayOpacity').value, 75);
  assert.equal(d.element('btn-save').disabled, false);
  assert.equal(d.c.localStorage.getItem('quicktype_overlay_config'), before);
  d.element('btn-save').events.click();
  assert.equal(d.c.loadOverlayConfig().apiUrl, 'https://example.com/hook');
});

test('Desktop import file reads file content and updates filename display', () => {
  class MockFileReader {
    readAsText(file) {
      this.result = file.content;
      this.onload();
    }
  }
  const d = uiContext('quicktype-overlay/desktop.js', {}, { FileReader: MockFileReader, Blob });
  const fakeFile = { name: 'profile.json', size: 100, content: '{"apiUrl":"https://example.com/file"}' };
  d.element('connectionFile').files = [fakeFile];
  d.element('connectionFile').events.change();
  assert.equal(d.element('connectionJson').value, '{"apiUrl":"https://example.com/file"}');
  assert.equal(d.element('connectionFileName').textContent, 'profile.json');
  assert.ok(d.element('connectionFileName').classList.contains('has-file'));
  assert.match(d.element('connection-transfer-status').textContent, /profile\.json/);

  d.element('connectionJson').events.input();
  assert.equal(d.element('connectionFileName').textContent, "No file selected");
  assert.ok(!d.element('connectionFileName').classList.contains('has-file'));
});

test('Desktop connection export copies to clipboard, populates textarea and saves file', async () => {
  let placed = '';
  let writtenPath = '', writtenContent = '';
  const d = uiContext('quicktype-overlay/desktop.js', { apiUrl: 'https://api.test/speech' }, {
    overwolf: {
      windows: {
        getCurrentWindow(cb) { cb({ success: true, window: { id: 'desktop' } }); },
        minimize() {}, close() {}
      },
      utils: {
        placeOnClipboard(text) { placed = text; },
        openNativeFolderPicker(path, cb) { cb({ success: true, path: 'C:\\Users\\User\\Downloads' }); }
      },
      io: {
        paths: { desktop: 'C:\\Users\\User\\Desktop', documents: 'C:\\Users\\User\\Documents' },
        writeFileContents(path, content, enc, uac, cb) {
          writtenPath = path;
          writtenContent = content;
          cb({ success: true });
        }
      }
    }
  });

  await d.element('btn-export-connection').events.click();
  assert.equal(writtenPath, 'C:\\Users\\User\\Downloads\\quicktype-connection.json');
  assert.ok(writtenContent.includes('https://api.test/speech'));
  assert.equal(placed, writtenContent);
  assert.equal(d.element('connectionJson').value, writtenContent);
  assert.match(d.element('connection-transfer-status').textContent, /File saved/);
});

test('Desktop speech check reports service accepted text upon success', async () => {
  const d = uiContext('quicktype-overlay/desktop.js');
  d.element('testInput').value = 'Проверка';
  d.c.executeRestRequest = async () => ({ ok: true, status: 200, durationMs: 42, body: '{"ok":true}' });
  await d.element('btn-test-request').events.click();
  assert.match(d.element('resultStatusText').textContent, /Service accepted the text/);
  assert.match(d.element('resultBoxTitle').textContent, /Service accepted the text/);
  assert.equal(d.element('resultBadge').textContent, 'HTTP 200');
});

test('Desktop speech test rejects empty and whitespace input for click and Enter, then permits valid text', async () => {
  const d = uiContext('quicktype-overlay/desktop.js');
  const sent = [];
  d.c.executeRestRequest = async (cfg, text) => {
    sent.push(text);
    return { ok: true, status: 204, durationMs: 1, body: '' };
  };
  for (const text of ['', '   ', '\t\n  ']) {
    d.element('testInput').value = text;
    await d.element('btn-test-request').events.click();
    d.key('Enter');
    assert.equal(sent.length, 0);
    assert.equal(d.element('btn-test-request').disabled, false);
    assert.match(d.element('resultStatusText').textContent, /Enter text/);
  }
  d.element('testInput').value = '  Привет  ';
  await d.element('btn-test-request').events.click();
  assert.deepEqual(sent, ['Привет']);
  assert.match(d.element('resultStatusText').textContent, /Service accepted the text/);
  d.element('testInput').value = '';
  await d.element('btn-test-request').events.click();
  assert.equal(d.element('resultBadge').style.display, 'none');
  assert.equal(d.element('testResultBox').style.display, 'none');
  assert.equal(sent.length, 1);
});

test('Desktop configuration exception unlocks speech test and permits a successful retry', async () => {
  const d = uiContext('quicktype-overlay/desktop.js');
  d.element('testInput').value = 'Проверка';
  d.c.executeRestRequest = async () => { throw new Error('Invalid request configuration'); };
  await d.element('btn-test-request').events.click();
  assert.equal(d.element('btn-test-request').disabled, false);
  assert.equal(d.element('requestDetails').open, true);
  assert.equal(d.element('testResultBox').open, true);
  assert.equal(d.element('resultBoxBody').textContent, 'Invalid request configuration');
  d.c.executeRestRequest = async () => ({ ok: true, status: 204, durationMs: 2, body: '' });
  await d.element('btn-test-request').events.click();
  assert.equal(d.element('btn-test-request').disabled, false);
  assert.equal(d.element('testResultBox').open, false);
  assert.equal(d.element('resultBadge').textContent, 'HTTP 204');
});

test('Overlay default height is compact 100px and error defaults to retry prompt', () => {
  const c = configContext();
  assert.equal(c.DEFAULT_CONFIG.overlayHeight, 100);
  const u = uiContext('quicktype-overlay/overlay.js');
  u.element('inputText').value = 'speak';
  u.key('Enter');
  const reqId = u.messages.find(m => m[1] === 'submit_text')[2].requestId;
  u.ipc({ id: 'rest_result', content: { ok: false, requestId: reqId } });
  assert.equal(u.element('hudStatusText').textContent, "Could not send. Enter — retry");
});

test('Overlay shows sending feedback banner on delay greater than 800ms', () => {
  const u = uiContext('quicktype-overlay/overlay.js');
  u.element('inputText').value = 'speak';
  u.key('Enter');
  assert.equal(u.element('hudStatusBanner').style.display, 'none');
  u.runTimers(800);
  assert.equal(u.element('hudStatusBanner').style.display, 'flex');
  assert.equal(u.element('hudStatusText').textContent, "Sending...");
});

test('Automatic overlay height survives resize events and still saves manual moves and resizes', () => {
  const u = uiContext('quicktype-overlay/overlay.js');
  const win = { id: 'overlay', left: 30, top: 40, width: 640, height: 100 };
  u.c.overwolf.windows.getCurrentWindow = cb => cb({ success: true, window: { ...win } });
  u.c.overwolf.windows.changeSize = (id, width, height, cb) => {
    Object.assign(win, { width, height });
    u.windowEvents.resize(); cb({ success: true });
  };
  const input = u.element('inputText');
  input.value = 'one\ntwo'; input.events.input(); u.runTimers(500);
  assert.equal(win.height, 126);
  assert.equal(u.c.loadOverlayConfig().overlayBounds, null);
  input.value += '\nthree'; input.events.input(); u.runTimers(500);
  assert.equal(win.height, 152);
  input.value = ''; input.events.input(); u.runTimers(500);
  assert.equal(win.height, 100);
  win.left = 70;
  u.element('hudDrag').events.mousedown({ button: 0, preventDefault() {} }); u.runTimers(500);
  assert.equal(u.c.loadOverlayConfig().overlayBounds.left, 70);
  win.height = 190;
  u.element('hudResizeGrip').events.mousedown({ button: 0, preventDefault() {}, stopPropagation() {} });
  assert.equal(u.c.loadOverlayConfig().overlayBounds.height, 190);
  input.value = 'one\ntwo'; input.events.input();
  assert.equal(win.height, 190);
});

test('Closing an untouched overlay preserves automatic height after reopening', () => {
  const win = { id: 'overlay', left: 30, top: 40, width: 640, height: 100 };
  let receive;
  const u = uiContext('quicktype-overlay/overlay.js', {}, { overwolf: { windows: {
    onMessageReceived: { addListener(listener) { receive = listener; } },
    sendMessage() {}, requestOverlayFocus() {},
    getCurrentWindow(cb) { cb({ success: true, window: { ...win } }); },
    changeSize(id, width, height, cb) { Object.assign(win, { width, height }); cb({ success: true }); }
  } } });
  u.key('Escape'); u.runTimers(500);
  assert.equal(u.c.loadOverlayConfig().overlayBounds, null);
  receive({ id: 'focus_input_field' });
  u.element('inputText').value = 'one\ntwo';
  u.element('inputText').events.input();
  assert.equal(win.height, 126);
});

test('ICO directory points to complete PNG images with matching dimensions', () => {
  const ico = fs.readFileSync(path.join(root, 'quicktype-overlay/icon.ico'));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  const count = ico.readUInt16LE(4);
  assert.equal(count, 4);
  let expectedOffset = 6 + count * 16;
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16;
    const size = ico.readUInt32LE(entry + 8), offset = ico.readUInt32LE(entry + 12);
    assert.equal(offset, expectedOffset);
    assert.ok(size >= 24 && offset + size <= ico.length);
    assert.equal(ico.subarray(offset, offset + 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(ico.readUInt32BE(offset + 16), ico[entry] || 256);
    assert.equal(ico.readUInt32BE(offset + 20), ico[entry + 1] || 256);
    expectedOffset += size;
  }
  assert.equal(expectedOffset, ico.length);
});

test('Cancelling native export does not write a fallback file', async () => {
  const d = uiContext('quicktype-overlay/desktop.js', { apiUrl: 'https://api.test/speech' });
  let writes = 0;
  d.c.overwolf.utils = { placeOnClipboard() {}, openNativeFolderPicker(path, cb) { cb({ success: false }); } };
  d.c.overwolf.io = { paths: { desktop: 'C:\\Desktop' }, writeFileContents() { writes++; } };
  await d.element('btn-export-connection').events.click();
  assert.equal(writes, 0);
  assert.match(d.element('connection-transfer-status').textContent, /Export cancelled/);
});

test('Rejected clipboard write exposes exported JSON without claiming it was copied', async () => {
  const d = uiContext('quicktype-overlay/desktop.js', { apiUrl: 'https://api.test/speech' }, {
    navigator: { clipboard: { writeText: async () => { throw new Error('Denied'); } } }
  });
  d.c.overwolf.utils = { openNativeFolderPicker(path, cb) { cb({ success: false }); } };
  d.c.overwolf.io = { writeFileContents() { assert.fail('Cancelled export wrote a file'); } };
  await d.element('btn-export-connection').events.click();
  assert.match(d.element('connection-transfer-status').textContent, /Could not copy/);
  assert.doesNotMatch(d.element('connection-transfer-status').textContent, /JSON copied/);
  assert.equal(d.element('connection-import').hidden, false);
  assert.equal(JSON.parse(d.element('connectionJson').value).apiUrl, 'https://api.test/speech');
});

test('Export without a system directory never writes a relative file path', async () => {
  const d = uiContext('quicktype-overlay/desktop.js', { apiUrl: 'https://api.test/speech' });
  d.c.overwolf.utils = { placeOnClipboard() {} };
  d.c.overwolf.io = { writeFileContents() { assert.fail('Export wrote to an unknown directory'); } };
  await d.element('btn-export-connection').events.click();
  assert.match(d.element('connection-transfer-status').textContent, /Export folder is unavailable/);
});

test('Selecting an oversized import invalidates a previous pending read', () => {
  let reader;
  const d = uiContext('quicktype-overlay/desktop.js', {}, { FileReader: function () { reader = this; this.readAsText = () => {}; } });
  const file = d.element('connectionFile');
  file.files = [{ name: 'first.json', size: 20 }]; file.events.change();
  file.files = [{ name: 'large.json', size: 1024 * 1024 + 1 }]; file.events.change();
  reader.result = '{"apiUrl":"https://stale.test"}'; reader.onload();
  assert.equal(d.element('connectionJson').value, '');
  assert.match(d.element('connection-transfer-status').textContent, /too large/);
});

test('Export invalidates pending import reads and clears the stale filename', async () => {
  let reader;
  const d = uiContext('quicktype-overlay/desktop.js', { apiUrl: 'https://current.test/' }, {
    FileReader: function () { reader = this; this.readAsText = () => {}; }
  });
  d.c.overwolf.utils = { placeOnClipboard() {}, openNativeFolderPicker(path, cb) { cb({ success: false }); } };
  d.c.overwolf.io = { writeFileContents() { assert.fail('Cancelled export wrote a file'); } };
  d.element('connectionFile').files = [{ name: 'old.json', size: 20 }];
  d.element('connectionFile').events.change();
  await d.element('btn-export-connection').events.click();
  reader.result = '{"apiUrl":"https://stale.test/"}'; reader.onload();
  assert.equal(JSON.parse(d.element('connectionJson').value).apiUrl, 'https://current.test/');
  assert.equal(d.element('connectionFileName').textContent, 'No file selected');
});

test('Distribution file list includes every manifest icon and window resource', () => {
  const manifest = JSON.parse(source('quicktype-overlay/manifest.json'));
  const script = source('scripts/package-app.ps1');
  const files = script.match(/\$files = @\(([\s\S]*?)\)/)[1];
  for (const resource of [manifest.meta.icon, manifest.meta.launcher_icon, manifest.meta.window_icon,
    ...Object.values(manifest.data.windows).map(w => w.file)]) {
    assert.ok(files.includes("'" + resource + "'"), resource + ' missing from distribution');
  }
});

test('System font loading deduplicates families, keeps selection and leaves settings unsaved until Save', async () => {
  let queries = 0;
  const d = uiContext('quicktype-overlay/desktop.js', {}, { window: { queryLocalFonts: async () => {
    queries++;
    return [{ family: 'Custom Serif' }, { family: 'Arial' }, { family: 'Custom Serif' }, { family: '  Custom Mono  ' }, { family: '' }];
  } } });
  const saved = d.c.localStorage.getItem(d.c.CONFIG_KEY);
  await new Promise(r => setImmediate(r));
  assert.equal(queries, 1);
  assert.deepEqual(d.element('overlayFont').options.map(o => o.value), ['Custom Mono', 'Custom Serif']);
  assert.equal(d.element('overlayFont').value, 'default');
  assert.equal(d.element('btn-save').disabled, true);
  assert.equal(d.c.localStorage.getItem(d.c.CONFIG_KEY), saved);
  await d.element('overlayFont').events.pointerdown();
  assert.equal(queries, 1);
  assert.equal(d.element('overlayFont').options.length, 2);
  d.element('overlayFont').value = 'Custom Serif'; d.element('overlayFont').events.change();
  assert.equal(d.element('btn-save').disabled, false);
  assert.equal(d.messages.at(-1)[2].overlayFont, 'Custom Serif');
  assert.equal(d.c.loadOverlayConfig().overlayFont, 'default');
  d.element('btn-save').events.click();
  const reopened = uiContext('quicktype-overlay/desktop.js', d.c.loadOverlayConfig());
  assert.equal(reopened.element('overlayFont').value, 'Custom Serif');
  assert.equal(reopened.element('overlayFont').options[0].textContent, 'Custom Serif');
  const u = uiContext('quicktype-overlay/overlay.js', d.c.loadOverlayConfig());
  assert.equal(u.element('inputText').style.fontFamily, '"Custom Serif", sans-serif');
});

test('System font requests handle unavailable API, denial, empty results and retry without changing preferences', async () => {
  const d = uiContext('quicktype-overlay/desktop.js', {});
  assert.match(d.element('system-fonts-status').textContent, /cannot list system fonts/);
  d.c.window.queryLocalFonts = async () => { const error = new Error('Denied'); error.name = 'NotAllowedError'; throw error; };
  await d.element('overlayFont').events.pointerdown();
  assert.match(d.element('system-fonts-status').textContent, /not granted/);
  d.c.window.queryLocalFonts = async () => [];
  await d.element('overlayFont').events.pointerdown();
  assert.match(d.element('system-fonts-status').textContent, /No system fonts/);
  assert.equal(d.element('btn-save').disabled, true);
  d.c.window.queryLocalFonts = async () => [{ family: 'Кастомный' }];
  d.element('overlayFont').events.keydown({ key: 'ArrowDown' });
  await new Promise(r => setImmediate(r));
  assert.equal(d.element('system-fonts-status').textContent, '');
});

test('Font enumeration blocks overlapping requests without resetting a selection made while waiting', async () => {
  let resolve, calls = 0;
  const d = uiContext('quicktype-overlay/desktop.js', {}, { window: {
    queryLocalFonts: () => { calls++; return new Promise(r => resolve = r); }
  } });
  await d.element('overlayFont').events.pointerdown();
  assert.equal(calls, 1);
  d.element('overlayFont').value = 'Consolas';
  resolve([{ family: 'Another font' }]); await new Promise(r => setImmediate(r));
  assert.equal(d.element('overlayFont').value, 'Consolas');
  assert.equal(d.element('system-fonts-status').textContent, '');
});

test('English interface ignores legacy language preference and preserves user and server text', async () => {
  const values = new Map([['quicktype_ui_language', 'ru']]);
  const d = uiContext('quicktype-overlay/desktop.js', {}, {
    localStorage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) }
  });
  assert.equal(d.element('dirty-indicator').textContent, 'All changes saved');
  d.element('testInput').value = 'Пользовательский текст';
  let sent;
  d.c.executeRestRequest = async (cfg, text) => {
    sent = text;
    return { ok: true, status: 200, durationMs: 1, body: 'Ответ сервера' };
  };
  await d.element('btn-test-request').events.click();
  assert.equal(sent, 'Пользовательский текст');
  assert.equal(d.element('resultBoxBody').textContent, 'Ответ сервера');
  assert.match(d.element('resultStatusText').textContent, /Service accepted/);
  assert.doesNotMatch(source('quicktype-overlay/desktop.html'), /id="uiLanguage"|<label for="(?:httpMethod|apiUrl)"/);
  assert.match(source('quicktype-overlay/desktop.html'), /aria-label="HTTP method"/);
  assert.match(source('quicktype-overlay/desktop.html'), /aria-label="Service URL"/);
});


