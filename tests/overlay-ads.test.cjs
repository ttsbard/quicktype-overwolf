const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = f => fs.readFileSync(path.join(root, f), 'utf8');

function fakeElement(id) {
  const attributes = {};
  return {
    id,
    hidden: false,
    style: {},
    attributes,
    setAttribute(name, value) { attributes[name] = String(value); },
    getAttribute(name) { return attributes[name]; }
  };
}

function harness(options = {}) {
  const state = {
    constructs: [],
    calls: [],
    logs: [],
    timers: new Map(),
    script: null
  };
  let nextTimer = 0;
  function schedule(fn, ms) {
    const id = ++nextTimer;
    state.timers.set(id, { fn, ms });
    return id;
  }
  function cancel(id) { state.timers.delete(id); }

  function FakeOwAd(container, settings) {
    if (options.constructorThrows) throw new Error('constructor rejected');
    this.container = container;
    this.settings = settings;
    this.listeners = {};
    state.constructs.push({ container, settings, instance: this });
    state.calls.push('construct');
  }
  FakeOwAd.prototype.addEventListener = function (name, listener) {
    this.listeners[name] = listener;
  };
  FakeOwAd.prototype.shutdown = function () {
    state.calls.push('shutdown');
    return options.shutdownRejects ? Promise.reject(new Error('shutdown rejected')) : Promise.resolve();
  };
  FakeOwAd.prototype.refreshAd = function () {
    state.calls.push('refresh');
    return true;
  };
  FakeOwAd.prototype.play = function () {
    state.calls.push('play');
    return true;
  };

  const win = {};
  if (options.preloaded) win.OwAd = FakeOwAd;
  const doc = {
    head: {
      appendChild(node) {
        state.script = node;
        if (options.autoLoad === false) return;
        if (options.loadError) {
          node.onerror();
          return;
        }
        win.OwAd = win.OwAd || FakeOwAd;
        node.onload();
      }
    },
    createElement(tagName) {
      return { tagName, src: '', async: false, onload: null, onerror: null };
    }
  };
  const logger = {
    warn(message) { state.logs.push(message); },
    error(message) { state.logs.push(message); }
  };
  const container = fakeElement('hudAdContainer');
  const wrapper = fakeElement('hudAd');
  const context = vm.createContext({
    console: { warn() {}, error() {} },
    Promise,
    setTimeout: schedule,
    clearTimeout: cancel,
    document: doc,
    window: win,
    module: { exports: {} }
  });
  vm.runInContext(source('quicktype-overlay/overlay-ads.js'), context);
  const controller = context.QuickTypeAds.create({
    container,
    wrapper,
    document: doc,
    window: win,
    logger,
    setTimeout: schedule,
    clearTimeout: cancel
  });
  return {
    controller,
    state,
    win,
    doc,
    container,
    wrapper,
    runLoadTimeout() {
      for (const [id, timer] of [...state.timers]) {
        if (timer.ms === context.QuickTypeAds.LOAD_TIMEOUT_MS) {
          state.timers.delete(id);
          timer.fn();
        }
      }
    },
    completeLoad() {
      win.OwAd = FakeOwAd;
      state.script.onload();
    }
  };
}

test('Official SDK creates one managed 400x60 container with the documented ID', () => {
  const h = harness();
  assert.ok(h.state.script);
  assert.equal(h.state.script.src, 'https://content.overwolf.com/libs/ads/latest/owads.min.js');
  assert.equal(h.state.script.async, true);
  assert.equal(h.state.constructs.length, 1);
  const settings = h.state.constructs[0].settings;
  assert.equal(settings.size.width, 400);
  assert.equal(settings.size.height, 60);
  assert.equal(settings.containerId, 'quicktype_400x60_in');
  assert.ok(settings.containerId.length <= 20);
  assert.equal(h.controller.getState(), 'ready');
  assert.equal(h.wrapper.getAttribute('data-ad-state'), 'ready');
  assert.equal(h.wrapper.hidden, false);
  assert.equal(h.container.style.display, '');
  assert.ok(h.state.constructs[0].instance.listeners.display_ad_loaded);
  assert.ok(h.state.constructs[0].instance.listeners.error);
  assert.deepEqual(h.state.calls, ['construct']);
});

test('Visibility uses CSS display:none without shutdown or refresh', () => {
  const h = harness();
  h.controller.setVisible(false);
  assert.equal(h.wrapper.hidden, true);
  assert.equal(h.container.style.display, 'none');
  assert.equal(h.controller.getState(), 'ready');
  assert.deepEqual(h.state.calls, ['construct']);

  h.controller.setVisible(true);
  assert.equal(h.wrapper.hidden, false);
  assert.equal(h.container.style.display, '');
  assert.deepEqual(h.state.calls, ['construct']);
});

test('SDK display and error events update state without reloading the ad', () => {
  const h = harness();
  const ad = h.state.constructs[0].instance;
  ad.listeners.display_ad_loaded();
  assert.equal(h.controller.getState(), 'displayed');
  ad.listeners.error();
  assert.equal(h.controller.getState(), 'error');
  assert.equal(h.state.constructs.length, 1);
  assert.deepEqual(h.state.calls, ['construct']);
  assert.match(h.state.logs.join('\n'), /no manual reload/);
});

test('Load failure and timeout fail closed without fake ad content or retries', () => {
  const failed = harness({ loadError: true });
  assert.equal(failed.controller.getState(), 'unavailable');
  assert.equal(failed.state.constructs.length, 0);
  assert.equal(failed.wrapper.hidden, false);
  assert.equal(failed.container.style.display, '');

  const timedOut = harness({ autoLoad: false });
  assert.equal(timedOut.controller.getState(), 'loading');
  timedOut.runLoadTimeout();
  assert.equal(timedOut.controller.getState(), 'unavailable');
  timedOut.state.script.onload();
  assert.equal(timedOut.state.constructs.length, 0);
  assert.equal(timedOut.state.calls.length, 0);
});

test('Constructor exceptions are contained and leave an empty layout placeholder', () => {
  const h = harness({ preloaded: true, constructorThrows: true });
  assert.equal(h.controller.getState(), 'unavailable');
  assert.equal(h.state.constructs.length, 0);
  assert.equal(h.wrapper.hidden, false);
  assert.equal(h.container.style.display, '');
  assert.match(h.state.logs.join('\n'), /could not create/);
});

test('A load completing while hidden waits for the next visible state', () => {
  const h = harness({ autoLoad: false });
  h.controller.setVisible(false);
  h.completeLoad();
  assert.equal(h.controller.getState(), 'loaded');
  assert.equal(h.state.constructs.length, 0);
  h.controller.setVisible(true);
  assert.equal(h.controller.getState(), 'ready');
  assert.equal(h.state.constructs.length, 1);
  assert.deepEqual(h.state.calls, ['construct']);
});

test('Shutdown is idempotent, hides the strip, and ignores a late SDK load', async () => {
  const h = harness({ autoLoad: false });
  await h.controller.shutdown();
  assert.equal(h.controller.getState(), 'shutdown');
  assert.equal(h.wrapper.hidden, true);
  assert.equal(h.container.style.display, 'none');
  h.state.script.onload();
  assert.equal(h.state.constructs.length, 0);
  await h.controller.shutdown();
  assert.deepEqual(h.state.calls, []);
});

test('Shutdown calls the SDK once and resolves even when the SDK rejects', async () => {
  const h = harness({ shutdownRejects: true });
  await h.controller.shutdown();
  assert.equal(h.controller.getState(), 'shutdown');
  assert.equal(h.wrapper.hidden, true);
  assert.deepEqual(h.state.calls, ['construct', 'shutdown']);
  assert.match(h.state.logs.join('\n'), /shutdown request was rejected/);
  await h.controller.shutdown();
  assert.deepEqual(h.state.calls, ['construct', 'shutdown']);
});

test('The integration never calls play or refresh and never uses a polling timer', () => {
  const h = harness();
  const adSource = source('quicktype-overlay/overlay-ads.js');
  assert.doesNotMatch(adSource, /setInterval\s*\(/);
  assert.doesNotMatch(adSource, /\.refreshAd\s*\(/);
  assert.doesNotMatch(adSource, /\.play\s*\(/);
  assert.deepEqual(h.state.calls, ['construct']);
});

test('Manifest reserves an unclipped 400x60 ad area and declares required permissions', () => {
  const manifest = JSON.parse(source('quicktype-overlay/manifest.json'));
  const overlay = manifest.data.windows.overlay;
  for (const permission of ['Extensions', 'Streaming', 'Profile', 'GameInfo']) {
    assert.ok(manifest.permissions.includes(permission), 'missing permission ' + permission);
  }
  assert.ok(overlay.min_size.width >= 420, 'window width must fit the 400px ad plus chrome');
  assert.ok(overlay.min_size.height >= 180, 'window height must fit the ad and input');
  assert.equal(overlay.size.width, 640);
  assert.equal(overlay.size.height, 180);
});

test('Overlay markup keeps the SDK container empty and loads the ad module before the overlay', () => {
  const html = source('quicktype-overlay/overlay.html');
  const css = source('quicktype-overlay/overlay.css');
  assert.match(html, /id="hudAdContainer"/);
  assert.match(html, /aria-label="Advertisement"/);
  const containerMarkup = html.match(/<div class="hud-ad-container"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(containerMarkup);
  assert.equal(containerMarkup[1].trim(), '');
  assert.ok(html.indexOf('src="overlay-ads.js"') > 0);
  assert.ok(html.indexOf('src="overlay-ads.js"') < html.indexOf('src="overlay.js"'));
  assert.doesNotMatch(html, /testAd|fake ad/i);
  assert.match(css, /\.hud-ad-container\s*\{[\s\S]*?width:\s*400px;[\s\S]*?height:\s*60px;[\s\S]*?min-width:\s*400px;[\s\S]*?min-height:\s*60px;/);
  assert.match(css, /\.hud-ad\[hidden\]\s*\{[\s\S]*?display:\s*none\s*!important;/);
  assert.match(css, /\.hud-ad\s*\{[\s\S]*?background:\s*transparent;/);
  // The bottom inset clears the rounded window clip and resize grip.
  assert.match(css, /\.hud-container\s*\{[\s\S]*?padding:\s*2px 6px 16px;/);
  assert.match(css, /\.hud-status-banner\s*\{[\s\S]*?max-height:\s*44px;[\s\S]*?overflow-y:\s*auto;/);
});
