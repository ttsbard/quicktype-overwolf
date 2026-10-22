/* Public Native API adapter. Rectangles use the DPI-aware API's logical pixels
 * as returned by getCurrentWindow. Use the object changeSize overload and pass
 * coordinates back unchanged; never scale these window dimensions twice.
 */
var QuickTypeWindows = (function () {
  function number(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? value : fallback;
  }
  function valid(rect) {
    return rect && ['left', 'top', 'width', 'height'].every(function (key) {
      return typeof rect[key] === 'number' && isFinite(rect[key]);
    }) && rect.width > 0 && rect.height > 0;
  }
  function scale(win, display) {
    if (win.dpiUnaware || win.dpiUnAware) return 1;
    var value = number(win.dpiScale, display ? number(display.dpiX, 96) / 96 : 1);
    return value > 0 ? value : 1;
  }
  function rectFromDisplay(display) {
    var r = display.workingArea;
    return valid(r) ? r : { left: display.x, top: display.y, width: display.width, height: display.height };
  }
  function intersection(a, b) {
    if (!valid(a) || !valid(b)) return 0;
    return Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)) *
      Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
  }
  function selectDisplay(displays, win, preferred) {
    var list = displays.filter(function (d) { return valid(rectFromDisplay(d)); });
    var match = list.filter(function (d) { return intersection(preferred, rectFromDisplay(d)) > 0; })
      .sort(function (a, b) { return intersection(preferred, rectFromDisplay(b)) - intersection(preferred, rectFromDisplay(a)); })[0];
    return match || list.find(function (d) { return d.id === win.monitorId; }) ||
      list.find(function (d) { return d.is_primary; }) || list[0];
  }
  // Every discovery callback settles, including unavailable APIs and timeouts.
  function query(target, name, callback) {
    if (!target || typeof target[name] !== 'function') { callback(null); return; }
    var settled = false;
    var timer = setTimeout(function () { complete(null); }, 800);
    function complete(result) {
      if (settled) return;
      settled = true; clearTimeout(timer); callback(result);
    }
    try { target[name](complete); } catch (_) { complete(null); }
  }
  function context(api, win, preferred, desktopOnly, callback) {
    query(api.utils, 'getMonitorsList', function (monitors) {
      var physicalDisplays = monitors && monitors.success ? monitors.displays || [] : [];
      // Public Native documents primary-monitor DPI for hybrid OSR windows.
      // Native windows use their current monitor; re-query after a move.
      var dpiDisplay = physicalDisplays.find(function (d) { return desktopOnly ? d.id === win.monitorId : d.is_primary; });
      var dpi = scale(win, dpiDisplay);
      var displays = physicalDisplays.map(function (d) {
        var r = rectFromDisplay(d);
        return Object.assign({}, d, { workingArea: {
          left: r.left / dpi, top: r.top / dpi, width: r.width / dpi, height: r.height / dpi
        } });
      });
      var display = selectDisplay(displays, win, preferred);
      function desktop() {
        var area = display && rectFromDisplay(display);
        // Browser fallback is current-monitor only; do not invent desktop bounds.
        if (!area && typeof window !== 'undefined' && window.screen) {
          var s = window.screen;
          var candidate = { left: s.availLeft, top: s.availTop, width: s.availWidth, height: s.availHeight };
          if (valid(candidate)) {
            var factor = desktopOnly ? dpi : 1;
            area = { left: candidate.left / factor, top: candidate.top / factor,
              width: candidate.width / factor, height: candidate.height / factor };
          }
        }
        callback({ area: area || null, scale: dpi, kind: 'desktop', monitorId: display && display.id });
      }
      if (desktopOnly) { desktop(); return; }
      query(api.games, 'getRunningGameInfo2', function (result) {
        var game = result && result.success && result.gameInfo;
        if (!game || !game.isRunning || !(game.isInFocus || game.gameIsInFocus)) { desktop(); return; }
        var width = number(game.logicalWidth, number(game.width, 0) / dpi);
        var height = number(game.logicalHeight, number(game.height, 0) / dpi);
        var area = { left: 0, top: 0, width: width, height: height };
        if (!valid(area)) { desktop(); return; }
        callback({ area: area, scale: dpi, kind: 'game', monitorId: null });
      });
    });
  }
  function fit(bounds, ctx, options) {
    options = options || {};
    var dpi = ctx.scale || 1;
    var rect = valid(bounds) ? Object.assign({}, bounds) : { left: 0, top: 0, width: 640, height: 100 };
    // Existing saves came from getCurrentWindow too. Keep their API units;
    // scale metadata is diagnostic, not an instruction to multiply them again.
    var area = ctx.area;
    var minW = options.desktopOnly ? 600 : 240;
    var minH = options.desktopOnly ? 700 : 60;
    rect.width = Math.round(Math.max(minW, Math.min(options.desktopOnly ? 600 : 1920, rect.width)));
    rect.height = Math.round(Math.max(minH, Math.min(options.desktopOnly ? 750 : 1080, rect.height)));
    if (valid(area)) {
      rect.width = Math.min(rect.width, Math.floor(area.width));
      rect.height = Math.min(rect.height, Math.floor(area.height));
      var center = options.center || !valid(bounds) || intersection(rect, area) === 0 ||
        (rect.context && rect.context !== ctx.kind);
      if (center || options.mode === 'bottom') rect.left = area.left + (area.width - rect.width) / 2;
      if (center) rect.top = area.top + (area.height - rect.height) / 2;
      if (options.mode === 'bottom') rect.top = area.top + area.height - rect.height - number(options.margin, 24);
      rect.left = Math.max(area.left, Math.min(area.left + area.width - rect.width, rect.left));
      rect.top = Math.max(area.top, Math.min(area.top + area.height - rect.height, rect.top));
    }
    return { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width),
      height: Math.round(rect.height), dpiScale: dpi, context: ctx.kind, coordinateSpace: 'logical' };
  }
  function same(a, b) {
    return valid(a) && valid(b) && ['left', 'top', 'width', 'height'].every(function (k) { return Math.abs(a[k] - b[k]) < 1; });
  }
  // Serialize geometry changes per window. Last queued intent wins; no callback
  // persists a rectangle superseded by a later user action.
  function create(api, desktopOnly) {
    var busy = false, next = null, epoch = 0;
    function place(options, callback) {
      if (next && next.callback) next.callback({ success: false, cancelled: true });
      next = { options: options, callback: callback, epoch: epoch };
      pump();
    }
    function pump() {
      if (busy || !next) return;
      busy = true;
      var job = next; next = null;
      function done(result, bounds) {
        busy = false;
        if (job.callback) job.callback(next || job.epoch !== epoch ? { success: false, cancelled: true } : result, bounds);
        pump();
      }
      query(api.windows, 'getCurrentWindow', function (result) {
        if (!result || !result.success || !result.window) { done({ success: false, error: 'Could not read window geometry' }); return; }
        var win = result.window;
        var preferred = job.options.reset ? null : job.options.bounds || win;
        context(api, win, job.options.center ? null : preferred, desktopOnly, function (ctx) {
          if (next || job.epoch !== epoch) { done({ success: false, cancelled: true }); return; }
          var bounds = fit(preferred, ctx, Object.assign({ desktopOnly: desktopOnly }, job.options));
          if (same(win, bounds)) { done({ success: true }, bounds); return; }
          function changePosition() {
            if (next || job.epoch !== epoch) { done({ success: false, cancelled: true }); return; }
            run('changePosition', [win.id, bounds.left, bounds.top], function (reply) { done(reply, bounds); });
          }
          function run(name, args, cb) {
            var settled = false;
            var timer = setTimeout(function () { finish({ success: false, error: name + ' timed out' }); }, 2000);
            function finish(reply) {
              if (settled) return;
              settled = true; clearTimeout(timer); cb(reply || { success: false, error: name + ' returned no result' });
            }
            try { api.windows[name].apply(api.windows, args.concat(finish)); }
            catch (error) { finish({ success: false, error: error.message }); }
          }
          // windows.setBounds is used by ODK but absent from the public Native
          // contract and @overwolf/types 3.51.1. Use documented APIs on 0.250+.
          if (Math.abs(win.width - bounds.width) >= 1 || Math.abs(win.height - bounds.height) >= 1) {
            run('changeSize', [{ window_id: win.id, width: bounds.width, height: bounds.height, auto_dpi_resize: true }], function (reply) {
              if (!reply.success) { done(reply); return; }
              changePosition();
            });
          } else changePosition();
        });
      });
    }
    return { place: place, cancel: function () {
      epoch++;
      var queued = next; next = null;
      if (queued && queued.callback) queued.callback({ success: false, cancelled: true });
    } };
  }
  return { valid: valid, fit: fit, same: same, selectDisplay: selectDisplay, context: context, create: create };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = QuickTypeWindows;
