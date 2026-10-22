// Run with an isolated npm prefix; no real Overwolf APIs are called.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const prefix = path.resolve(process.argv[2] || '.work/odk-evaluation');
const deps = path.join(prefix, 'node_modules');
const { Windows, MonitorHelper } = require(path.join(deps, '@overwolf/odk-ts'));
const pkg = require(path.join(deps, '@overwolf/odk-ts/package.json'));
assert.equal(pkg.version, '1.1.2');
const calls = [];
const shared = {};
global.window = {};
const info = { id: 'probe', type: 'OffScreen', monitorId: 'primary', left: 100, top: 100,
  width: 960, height: 150, dpiScale: 1.5,
  logicalBounds: { left: 66.67, top: 66.67, width: 640, height: 100 } };
const event = () => ({ addListener() {}, removeListener() {} });
global.overwolf = {
  windows: {
    getMainWindow: () => shared,
    getWindow(id, cb) { calls.push('getWindow'); cb({ success: true, window: { ...info, id } }); },
    onStateChanged: event(), onScreenPropertyChanged: event(),
    bringToFront(id, focus, cb) { calls.push(['bringToFront', focus]); cb({ success: true }); },
    setBounds(args, cb) { calls.push(['setBounds', args]); cb({ success: true }); },
    getWindowState(id, cb) { cb({ success: true, window_state_ex: 'normal' }); }
  },
  windows2: Object.fromEntries(['resized', 'moved', 'dragStarted', 'dpiChanged', 'readyToShow', 'loadError'].map(n => [n, event()])),
  games: { getRunningGameInfo2(cb) { cb({ success: true, gameInfo: null }); } },
  utils: { getMonitorsList(cb) { cb({ success: true, displays: [{ id: 'primary', x: 0, y: 0, width: 1920, height: 1080, dpiX: 144 }] }); } }
};
(async () => {
  // A plain Native app does not initialize ODK's shared registry.
  await assert.rejects(Windows.FromId('unseeded'), TypeError);
  shared.___odkinternal___ = {};
  const win = await Windows.FromId('probe');
  assert.equal(typeof Windows.Self, 'function');
  assert.equal(Windows.self, undefined);
  assert.equal(typeof Windows.FromId, 'function');
  assert.equal(Windows.fromId, undefined);
  assert.equal(await Windows.FromId('probe'), win);
  await win.bringToFrontWithFocus();
  assert.deepEqual(calls.find(c => Array.isArray(c) && c[0] === 'bringToFront'), ['bringToFront', true]);
  await win.setBounds({ x: 100, y: 100, width: 640, height: 100 });
  assert.ok(calls.some(c => Array.isArray(c) && c[0] === 'setBounds'));
  // Public Display schema has x/y/width/height; workingArea is not guaranteed.
  await assert.rejects(MonitorHelper.getWindowMonitor(win), TypeError);
  const esbuild = require(path.join(deps, 'esbuild'));
  const output = path.join(prefix, 'odk-browser-probe.js');
  await esbuild.build({ entryPoints: [path.join(__dirname, 'entry.js')], nodePaths: [deps], bundle: true,
    platform: 'browser', format: 'iife', globalName: 'OdkProbe', target: 'chrome125', minify: true, outfile: output });
  new (require('node:vm').Script)(fs.readFileSync(output, 'utf8'));
  console.log(JSON.stringify({ version: pkg.version, browserBundleBytes: fs.statSync(output).size,
    existingWindowWrapper: 'works after shared registry initialization',
    focus: 'delegates to bringToFront(id, true)',
    publicDisplayShape: 'MonitorHelper throws without workingArea',
    scope: 'Mock API and browser bundle only; no live Overwolf or games tested' }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
