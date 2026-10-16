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
      addEventListener(n, f) { documentEvents[n] = f; } },
    window: { focus() {}, addEventListener(n, f) { windowEvents[n] = f; } },
    overwolf: { windows: { onMessageReceived: { addListener(f) { ipc = f; } },
      sendMessage(...args) { messages.push(args); const cb = args.at(-1); if (typeof cb === 'function') cb({ success: true }); },
      requestOverlayFocus(id, cb) { assert.equal(id, 'overlay'); cb({ success: true }); },
      getCurrentWindow(cb) { cb({ success: true, window: { id: 'overlay', left: 30, top: 40, width: 800, height: 250 } }); },
      dragMove(id, cb) { cb({ success: true }); }, dragResize(id, edge, cb) { dragResizes.push({ id, edge }); cb({ success: true }); },
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

for (const text of ['$&', "$'", '$`', '$$', 'a"\\\nb', 'Привет 👋']) {
  test('JSON template preserves ' + JSON.stringify(text), async () => {
    let body;
    const c = configContext({ fetch: async (url, opts) => { body = opts.body; return { ok: true, status: 200, statusText: 'OK', text: async () => '{}' }; } });
    const result = await c.executeRestRequest(c.DEFAULT_CONFIG, text);
    assert.equal(result.ok, true); assert.equal(JSON.parse(body).text, text);
  });
}
test('Plain text preserves newlines, quotes and dollars', async () => {
  let body;
  const c = configContext({ fetch: async (url, opts) => { body = opts.body; return { ok: true, status: 204, text: async () => '' }; } });
  const text = 'one\n"two"\\$&';
  await c.executeRestRequest({ ...c.DEFAULT_CONFIG, headers: '{"CONTENT-TYPE":"text/plain"}', payloadTemplate: '{text}' }, text);
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
    await assert.rejects(c.executeRestRequest({ ...c.DEFAULT_CONFIG, headers }, 'x'), /заголовки/);
  }
  await assert.rejects(c.executeRestRequest({ ...c.DEFAULT_CONFIG, apiUrl: 'file:///secret' }, 'x'), /http/);
  await assert.rejects(c.executeRestRequest({ ...c.DEFAULT_CONFIG, httpMethod: 'DELETE' }, 'x'), /GET/);
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
  const result = await c.executeRestRequest(c.DEFAULT_CONFIG, 'test');
  assert.equal(result.statusText, 'Timeout'); callback({ success: true, statusCode: 200 }); assert.equal(count, 1);
});
test('Deadline covers hanging fetch body and aborts transport', async () => {
  let signal;
  const c = configContext({ setTimeout: (fn, ms) => setTimeout(fn, ms === 15000 ? 15 : ms),
    fetch: async (url, opts) => { signal = opts.signal; return { ok: true, status: 200, text: () => new Promise(() => {}) }; } });
  const result = await c.executeRestRequest(c.DEFAULT_CONFIG, 'test');
  assert.equal(result.statusText, 'Timeout'); assert.equal(signal.aborted, true);
});
test('Native exceptions are reported without potentially duplicating POST', async () => {
  const c = configContext({ overwolf: { web: { sendHttpRequest() { throw Error('native failed'); } } },
    fetch: () => { throw Error('Unexpected fallback'); } });
  const result = await c.executeRestRequest(c.DEFAULT_CONFIG, 'x'); assert.equal(result.ok, false); assert.match(result.error, /native failed/);
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
test('GamesList rejects duplicates and validates XML without touching installed cache', () => {
  const { patchGameList, validateXml } = require('../scripts/patch-overwolf-gamelist.js');
  assert.throws(() => patchGameList('<Games><GameInfo><ID>1</ID><ControlModes>A</ControlModes><ControlModes>B</ControlModes></GameInfo></Games>', '1'), /Duplicate/);
  if (process.platform === 'win32') { validateXml('<Games><GameInfo><ID>1</ID></GameInfo></Games>'); assert.throws(() => validateXml('<Games>')); }
});
test('Sources parse; manifest and HTML resource references exist; Markdown links resolve', () => {
  for (const f of ['config.js', 'desktop.js', 'overlay.js']) new vm.Script(source('quicktype-overlay/' + f));
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
  assert.match(u.element('hudStatusBanner').textContent, /контроллера/);
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
  assert.equal(banner.textContent, '');
  assert.equal(container.classList.contains('status-sending'), false);

  const reqId = u.messages.find(m => m[1] === 'submit_text')[2].requestId;

  // On success: no banner, no glowing outline
  u.ipc({ id: 'rest_result', content: { ok: true, requestId: reqId } });
  assert.equal(banner.style.display, 'none');
  assert.equal(banner.textContent, '');
  assert.equal(container.classList.contains('status-success'), false);
  u.runTimers(350);

  // Next request with error:
  input.value = 'will fail';
  u.key('Enter');
  const reqId2 = u.messages.filter(m => m[1] === 'submit_text')[1][2].requestId;
  u.ipc({ id: 'rest_result', content: { ok: false, requestId: reqId2, error: 'Ошибка 500' } });

  // On error: only error text, no red outline on container
  assert.equal(banner.style.display, 'flex');
  assert.equal(banner.textContent, 'Ошибка 500');
  assert.equal(container.classList.contains('status-error'), false);

  // Typing clears the error
  input.events.input();
  assert.equal(banner.style.display, 'none');
  assert.equal(banner.textContent, '');
});

test('Desktop test response close button hides testResultBox and resets status badge', async () => {
  let resolve;
  const d = uiContext('quicktype-overlay/desktop.js');
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
  assert.equal(badge.textContent, 'Готов к тесту');
  assert.equal(d.element('resultStatusText').textContent, '');
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
  assert.match(d.element('overlayPreview').style.background, /0.65/);
  d.element('overlayOpacity').value = '90';
  d.element('overlayOpacity').events.input();
  assert.equal(d.element('btn-save').disabled, true);
  d.element('showHints').checked = false;
  d.element('showHints').events.change();
  assert.equal(d.element('previewHints').hidden, true);
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

test('Desktop invalid headers reveal their editor from the overlay tab and preserve saved settings', () => {
  const d = uiContext('quicktype-overlay/desktop.js');
  d.element('tab-overlay').events.click();
  assert.equal(d.element('panel-connection').hidden, true);
  d.element('headers').value = '{bad';
  d.element('btn-save').events.click();
  assert.equal(d.element('panel-connection').hidden, false);
  assert.equal(d.element('tab-connection').attributes['aria-selected'], 'true');
  assert.equal(d.element('requestDetails').open, true);
  assert.match(d.element('save-indicator').textContent, /Ошибка в JSON/);
  assert.doesNotThrow(() => JSON.parse(d.c.loadOverlayConfig().headers));
});

test('Desktop response details collapse on success and open on HTTP failure', async () => {
  const d = uiContext('quicktype-overlay/desktop.js');
  d.c.executeRestRequest = async () => ({ ok: true, status: 204, durationMs: 12, body: '' });
  await d.element('btn-test-request').events.click();
  assert.equal(d.element('testResultBox').open, false);
  d.c.executeRestRequest = async () => ({ ok: false, status: 400, durationMs: 15, body: 'Bad request' });
  await d.element('btn-test-request').events.click();
  assert.equal(d.element('testResultBox').open, true);
  assert.equal(d.element('resultBoxBody').textContent, 'Bad request');
});

test('Desktop service preset switches to TTSBard defaults and updates URL/method', () => {
  const d = uiContext('quicktype-overlay/desktop.js');
  assert.equal(d.element('serviceType').value, 'ttsbard');
  d.element('serviceType').value = 'custom';
  d.element('serviceType').events.change();
  assert.equal(d.element('serviceType').value, 'custom');
  d.element('apiUrl').value = 'https://custom.test/hook';
  d.element('httpMethod').value = 'GET';
  d.element('serviceType').value = 'ttsbard';
  d.element('serviceType').events.change();
  assert.equal(d.element('apiUrl').value, 'http://127.0.0.1:10101/v1/speech');
  assert.equal(d.element('httpMethod').value, 'POST');
});

test('Desktop speech check reports service accepted text upon success', async () => {
  const d = uiContext('quicktype-overlay/desktop.js');
  d.c.executeRestRequest = async () => ({ ok: true, status: 200, durationMs: 42, body: '{"ok":true}' });
  await d.element('btn-test-request').events.click();
  assert.match(d.element('resultStatusText').textContent, /Сервис принял текст/);
  assert.match(d.element('resultBoxTitle').textContent, /Сервис принял текст/);
  assert.equal(d.element('resultBadge').textContent, 'HTTP 200');
});

test('Overlay default height is compact 100px and error defaults to retry prompt', () => {
  const c = configContext();
  assert.equal(c.DEFAULT_CONFIG.overlayHeight, 100);
  const u = uiContext('quicktype-overlay/overlay.js');
  u.element('inputText').value = 'speak';
  u.key('Enter');
  const reqId = u.messages.find(m => m[1] === 'submit_text')[2].requestId;
  u.ipc({ id: 'rest_result', content: { ok: false, requestId: reqId } });
  assert.equal(u.element('hudStatusBanner').textContent, 'Не удалось отправить. Enter — повторить');
});

test('Overlay shows sending feedback banner on delay greater than 800ms', () => {
  const u = uiContext('quicktype-overlay/overlay.js');
  u.element('inputText').value = 'speak';
  u.key('Enter');
  assert.equal(u.element('hudStatusBanner').style.display, 'none');
  u.runTimers(800);
  assert.equal(u.element('hudStatusBanner').style.display, 'flex');
  assert.equal(u.element('hudStatusBanner').textContent, 'Отправка...');
});


