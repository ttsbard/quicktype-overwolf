/* Official Overwolf Native Ads SDK integration for the in-game input window.
 * The SDK owns ad selection, delivery, refresh, and impression accounting.
 * This module only creates the documented 400x60 managed container and
 * forwards visibility/teardown intents. It must never call refresh, play,
 * dispatch ad events, or fake an impression.
 */
var QuickTypeAds = (function () {
  var SDK_URL = 'https://content.overwolf.com/libs/ads/latest/owads.min.js';
  var AD_WIDTH = 400;
  var AD_HEIGHT = 60;
  // <= 20 chars, following appname_widthXheight_window_position.
  var CONTAINER_ID = 'quicktype_400x60_in';
  var LOAD_TIMEOUT_MS = 15000;

  function noopController(state) {
    return {
      setVisible: function () {},
      shutdown: function () { return Promise.resolve(); },
      getState: function () { return state; }
    };
  }

  function create(options) {
    options = options || {};
    var container = options.container;
    var wrapper = options.wrapper || null;
    var doc = options.document || (typeof document !== 'undefined' ? document : null);
    var win = options.window || (typeof window !== 'undefined' ? window : null);
    var logger = options.logger || (typeof console !== 'undefined' ? console : null);
    var schedule = options.setTimeout || (typeof setTimeout !== 'undefined' ? setTimeout : null);
    var cancel = options.clearTimeout || (typeof clearTimeout !== 'undefined' ? clearTimeout : null);

    if (!container) {
      log('error', 'Ad container is missing; the ad strip was not initialized.');
      return noopController('unavailable');
    }

    var state = 'idle';
    var ad = null;
    var visible = true;
    var disposed = false;
    var failed = false;
    var sdkReady = false;
    var scriptRequested = false;
    var loadTimer = null;

    function log(level, message) {
      if (!logger || typeof logger[level] !== 'function') return;
      logger[level]('[QuickType ads] ' + message);
    }

    function setState(next) {
      state = next;
      if (wrapper && typeof wrapper.setAttribute === 'function') {
        wrapper.setAttribute('data-ad-state', next);
      }
    }

    // Overwolf documents display:none on the ad container as the supported
    // way to stop displaying ads temporarily. There is no Opacity change and
    // no manual refresh here.
    function setVisible(show) {
      var next = !!show && !disposed;
      visible = next;
      if (wrapper) {
        wrapper.hidden = !next;
        if (wrapper.style) wrapper.style.display = next ? '' : 'none';
      }
      if (container.style) container.style.display = next ? '' : 'none';
      // Do not ask the SDK for an ad while the window is hidden. If loading
      // finishes during a hide, the container is created on the next show.
      if (next && sdkReady && !ad && !failed) instantiate();
    }

    function fail(message) {
      failed = true;
      setState('unavailable');
      log('warn', message);
    }

    function instantiate() {
      if (disposed || ad || failed || !sdkReady) return;
      setState('initializing');
      var created = null;
      try {
        created = new win.OwAd(container, {
          size: { width: AD_WIDTH, height: AD_HEIGHT },
          containerId: CONTAINER_ID
        });
        if (typeof created.addEventListener === 'function') {
          created.addEventListener('display_ad_loaded', function () {
            if (!disposed) setState('displayed');
          });
          created.addEventListener('error', function () {
            if (disposed) return;
            setState('error');
            log('warn', 'The Ads SDK reported an ad error; no manual reload was attempted.');
          });
        }
        ad = created;
        setState('ready');
      } catch (error) {
        // A partially constructed SDK instance must not keep running unwatched.
        if (created && typeof created.shutdown === 'function') {
          try {
            var pending = created.shutdown();
            if (pending && typeof pending.catch === 'function') pending.catch(function () {});
          } catch (_) { /* The container is already being abandoned. */ }
        }
        ad = null;
        fail('The Ads SDK could not create the 400x60 container.');
        return;
      }
      setVisible(visible);
    }

    function loadSdk() {
      if (disposed) return;
      if (win && typeof win.OwAd === 'function') {
        sdkReady = true;
        if (visible) instantiate();
        else setState('loaded');
        return;
      }
      if (scriptRequested) return;
      scriptRequested = true;
      setState('loading');

      if (!doc || typeof doc.createElement !== 'function') {
        fail('The Ads SDK cannot load because the document is unavailable.');
        return;
      }
      var script = doc.createElement('script');
      script.src = SDK_URL;
      script.async = true;

      var settled = false;
      function finish(ok, reason) {
        if (settled) return;
        settled = true;
        if (loadTimer && cancel) {
          cancel(loadTimer);
          loadTimer = null;
        }
        if (disposed) return;
        if (!ok) {
          fail(reason || 'The Ads SDK failed to load.');
          return;
        }
        if (!win || typeof win.OwAd !== 'function') {
          fail('The Ads SDK loaded without an OwAd constructor.');
          return;
        }
        sdkReady = true;
        if (visible) instantiate();
        else setState('loaded');
      }

      script.onload = function () { finish(true); };
      script.onerror = function () { finish(false, 'The Ads SDK failed to load from the official URL.'); };
      if (schedule) {
        loadTimer = schedule(function () {
          loadTimer = null;
          finish(false, 'The Ads SDK load timed out.');
        }, LOAD_TIMEOUT_MS);
      }

      var parent = doc.head || doc.body || doc.documentElement;
      if (!parent || typeof parent.appendChild !== 'function') {
        finish(false, 'The Ads SDK cannot load because no document node can hold its script.');
        return;
      }
      try {
        parent.appendChild(script);
      } catch (error) {
        finish(false, 'The Ads SDK script could not be added to the document.');
      }
    }

    function shutdown() {
      if (disposed) return Promise.resolve();
      disposed = true;
      if (loadTimer && cancel) {
        cancel(loadTimer);
        loadTimer = null;
      }
      setVisible(false);
      setState('shutdown');

      var instance = ad;
      ad = null;
      if (!instance || typeof instance.shutdown !== 'function') return Promise.resolve();
      try {
        var result = instance.shutdown();
        if (result && typeof result.then === 'function') {
          return result.then(function () {}, function () {
            log('warn', 'The Ads SDK shutdown request was rejected.');
          });
        }
        return Promise.resolve();
      } catch (error) {
        log('warn', 'The Ads SDK shutdown request failed.');
        return Promise.resolve();
      }
    }

    setState('idle');
    setVisible(true);
    loadSdk();

    return {
      setVisible: setVisible,
      shutdown: shutdown,
      getState: function () { return state; }
    };
  }

  return {
    create: create,
    SDK_URL: SDK_URL,
    AD_WIDTH: AD_WIDTH,
    AD_HEIGHT: AD_HEIGHT,
    CONTAINER_ID: CONTAINER_ID,
    LOAD_TIMEOUT_MS: LOAD_TIMEOUT_MS
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = QuickTypeAds;
