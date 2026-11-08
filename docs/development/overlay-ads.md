# Overwolf Native advertising strip for the in-game input overlay

Status: **implementation candidate only.** It has not been accepted by Overwolf, has not
been run against a live ad-serving app, and has not been submitted or packaged. Do not
describe it as compliant or approved.

Date of documentation check: 2026-11-08.

## Scope

- Adds a genuine Overwolf Native `OwAd` managed container inside `overlay.html`, directly
  below the existing input UI.
- Uses the supported 400x60 ad size from the official list.
- Keeps the ad in the same window as the input. There is no ad-only window, no desktop
  "Send" tab, and no fake/fallback creative.
- The Overwolf SDK owns ad selection, delivery, refresh, and impression accounting. This
  integration does not call `play()`, `refreshAd()`, or fire impression events, and does
  not add a forced dwell timer.
- The existing controller still owns native focus, the toggle hotkey, drafts, resizing,
  and window geometry.

## API verification

The current official documentation was checked through the Overwolf Docs MCP using the
`algolia_search_index_overwolf` Native filter (`docs-ow-native-current`) and the official
pages below were then read. The local, dev-only `@overwolf/types` 3.51.1 `owads.d.ts` was
also checked for signatures; it is not an app dependency and no package was installed.

- [OwAd reference](https://dev.overwolf.com/ow-native/reference/ads/owad/): SDK URL,
  `new OwAd(container, settings)`, `shutdown()`, supported sizes, container IDs, events,
  and required manifest permissions.
- [Advertising overview](https://dev.overwolf.com/ow-native/monetization/advertising/overview):
  ad policy, SDK/container rules, and the QA enablement step.
- [Ad planning guidelines](https://dev.overwolf.com/ow-native/monetization/advertising/standard-ads/working-with-ads):
  placement expectations and the same size table.
- [Recommended ad layouts](https://dev.overwolf.com/ow-native/monetization/advertising/standard-ads/recommended-ads-layouts):
  400x60 is listed under supported layouts; the note there says 400x60 creatives must sit
  at the top of their ad container.
- [In-game overlay/ad compliance](https://dev.overwolf.com/ow-native/guides/game-compliance/overview)
  and [Riot in-game ad rules](https://dev.overwolf.com/ow-native/guides/game-compliance/riot-in-game-ads).

Documented 400x60 form:

```js
new OwAd(container, {
  size: { width: 400, height: 60 },
  containerId: 'quicktype_400x60_in'
});
```

`containerId` is 19 characters (the documented limit is 20). The SDK script is loaded from
the official HTTPS URL:

```text
https://content.overwolf.com/libs/ads/latest/owads.min.js
```

The manifest now includes the permissions the OwAd reference requires for ad targeting:
`Extensions`, `Streaming`, `Profile`, and `GameInfo` (the existing `GameInfo` entry is
retained). Other existing permissions are unchanged.

## Implementation

- `quicktype-overlay/overlay-ads.js`
  - Loads the official SDK asynchronously once, with `onload`, `onerror`, and a 15-second
    load timeout.
  - Creates exactly one 400x60 managed container with `containerId`
    `quicktype_400x60_in`.
  - Treats missing SDK, script failure, timeout, a missing `OwAd` constructor, and a
    constructor exception as an unavailable ad strip. The reserved strip stays empty; no
    local/fake ad is inserted.
  - Listens to `display_ad_loaded` and `error` only to expose diagnostic state. It does
    not request a reload on either event.
  - Hides the ad with the documented CSS `display: none` while the window/overlay is
    hidden. The container is re-shown without a new SDK request when the overlay returns.
  - If the SDK finishes loading while the overlay is hidden, container creation is
    deferred until the next visible state. No ad is requested into a hidden container.
  - Calls `OwAd.shutdown()` on `pagehide`/`beforeunload`, once, and catches synchronous
    and asynchronous shutdown failures. The overlay window is normally minimized rather
    than destroyed, so hide does not shut down/recreate the container. This avoids a new
    managed container on every frequent open while still following the documented
    temporary-hide method.
- `quicktype-overlay/overlay.html`
  - Adds `#hudAd` below the existing footer and an empty `#hudAdContainer` (the SDK is the
    only thing allowed to populate that element).
  - Loads `overlay-ads.js` before `overlay.js`.
- `quicktype-overlay/overlay.css`
  - Reserves a transparent 400x60 content area and keeps the existing transparent parent
    requirement. No ad opacity changes.
- `quicktype-overlay/overlay.js`
  - Creates the ad controller only inside Overwolf.
  - Hides/shows the ad with overlay visibility and `visibilitychange`, and shuts down on
    page teardown.
  - Automatic height now starts at 180px and grows by 26px per extra line, capped at
    320px, so the 60px strip is included rather than clipped.
  - Saved/legacy bounds are clamped to at least 420x180. Existing focus, draft, submit,
    Escape, drag, and resize paths are unchanged.
- `quicktype-overlay/manifest.json`
  - Overlay default size: 640x180.
  - Overlay minimum size: 420x180. The extra 20px width covers the 400px ad plus the
    container border/padding and 6px of slack; 180px covers the 60px ad plus the header,
    input, footer, border, and padding.
- `quicktype-overlay/window-geometry.js`
  - Non-desktop placement defaults and clamps use 420x180. The desktop settings window is
    unchanged.

### Packaging follow-up (out of scope here)

`scripts/package-app.ps1` has an explicit file list and does not yet include
`overlay-ads.js`. Packaging was deliberately not run or changed for this task. Before any
future ZIP/OPK build, the parent/owner must add `'overlay-ads.js'` to that list, otherwise
the overlay will reference a missing script and no ad will initialize. This is a packaging
integration item, not a claim that the candidate is ready to distribute.

## Policy review: unresolved and potentially conflicting

These are policy/approval issues, not resolved by this code. They must be answered in
writing before distribution or submission.

### General advertising policy

What is supported by the implementation:

- Only Overwolf's managed SDK is used; there is no third-party ad iframe or fake creative.
- The ad is directly adjacent to the input content, not an ad-only window.
- Only one ad container exists in this window. No video/high-impact/in-stream option is
  requested.
- Ad opacity is not changed. No auto-refresh or impression manipulation is implemented.

What is **not demonstrated**:

- The ad planning page says ads should be placed where they are seen for more than a short
  moment. The app owner states this input overlay opens frequently and may be short-lived.
  That is a direct policy risk for this placement. The recommended-layouts page does list
  400x60 in the `PopUp Studio Plus` layout and describes that layout for short sessions in
  small windows over games or loading screens. That supports 400x60 as a recognized format,
  but it is not an approval of this specific short, repeated overlay and does not override
  the general active-gameplay text below.
- The in-game compliance page says: "No in-game ads during active gameplay" and that ads
  should be shown during loading screens, after matches, or in menus. A quick-input
  accessibility overlay can be opened during active gameplay. This implementation is
  therefore a candidate that needs an explicit exception or a different placement; the
  current public policy text does not establish that such an exception is granted.
- The same page says overlays should avoid active gameplay and that persistent overlays
  during gameplay will not be approved. The app's input is user-invoked and dismissible,
  but it is still an in-game overlay that can be open briefly during play.
- The input overlay is not a settings page, but if it is ever used as a notification-only
  screen, ads there would conflict with the "never on notification screens" guidance.
- The existing **Settings** button opens a separate desktop window over the in-game overlay.
  The ad planning guidelines say pop-ups must not block ad containers. This change does not
  alter that existing flow, so the settings window may occlude the strip. QA/design must
  confirm the windows' positions or hide the overlay/ad while settings is open. This is an
  unresolved placement issue, not a claim of compliance.

### Riot in-game ad rules

- Rule 1 requires ad-supported overlays to be explicitly opted in by the user. The
  background controller currently opens the input overlay automatically at app startup,
  and also opens it from the hotkey/dock launch. Automatic startup display is not an
  explicit in-game opt-in for an ad-supported overlay.
- Rule 4 prohibits floating ads and requires ads to be part of a screen with real value.
  This strip is embedded in the input screen, not a standalone floating banner, but that
  does not resolve Rule 1.
- Rule 2's dimming requirement applies to large overlays. This is a 400x60 strip in a
  compact window; this implementation does not add a dimmer. QA must confirm the compact
  classification.
- Rules 3, 5, and 6 (do not cover important game UI, no in-game upgrade/remove-ads CTAs,
  visual distinction) are not intentionally violated: no in-game CTA was added and the ad
  uses the app's own container. However, the strip increases the window's height by 60px,
  so it can cover more game UI depending on where the user places the overlay. Actual
  overlap must be checked in-game; static review cannot certify it.
- Riot games compliance additionally requires Riot's third-party application approval for
  Riot integrations and says apps at publication without Riot approval will be asked for
  it. The manifest targets all games, so an ad can appear over a Riot game. No Riot
  approval is documented in this repository.

### Other game-specific pages checked

The Call of Duty: Warzone, Dota 2, New World, and Rainbow 6 Siege pages were checked. They
did not add a specific ad-container rule beyond the general game-compliance requirements,
but they still require compliance with each game's EULA/TOS. No game-specific approval or
QA evidence is present for this build. The app's `game_targeting.type` remains `all`.
No public Cult of the Lamb-specific ad guidance was found in the Native documentation
index on 2026-11-08; the general rules and the game's EULA/TOS still apply.

### Accessibility exception

No public Overwolf documentation was found that grants an accessibility exception to the
"no in-game ads during active gameplay" or Riot opt-in rules. The owner plans to request an
exception first. That request is not evidence of approval. This candidate must not be
submitted or represented as approved until Overwolf/QA responds in writing.

### What is not claimed

- No real ad was loaded, viewed, clicked, or measured.
- No focus, DPI, exclusive-mode, resize, or multi-monitor behavior was verified in a live
  Overwolf game overlay.
- No QA acceptance, ad enablement, Riot approval, or accessibility exception is claimed.
- No monetization, impression, or revenue result is claimed.

## QA / approval checklist

1. Obtain written Overwolf confirmation for the accessibility/active-gameplay placement,
   or move the ad to an approved screen (for example a non-gameplay settings/menu surface).
2. Resolve Riot Rule 1 opt-in: avoid automatic ad display at startup, or obtain an explicit
   exception/consent design. Confirm whether Riot's third-party approval is required for
   the games this app can overlay.
3. Confirm Overwolf will enable ads for the app in the Developers Console. Ads are served
   only after their QA pass; the code alone does not enable serving.
4. Test with a real managed ad (no `testAd` flag and no fake creative) in an unpacked
   Overwolf Native build.
5. Verify the 400x60 ad is not clipped at minimum 420x180, at 150% DPI, on multi-monitor
   setups, in windowed/fullscreen game modes, and while the game is focused.
6. Verify hide/show: no ad is requested/created while hidden, the same managed container
   resumes on show without a manual refresh, and teardown calls shutdown once.
7. Verify keyboard flow while the ad is visible: input focus on open, Enter sends once,
   Escape hides, Shift+Enter inserts a line, drafts survive hide/show, native toggle hotkey
   still works, and clicking the ad does not strand the user without a way back to input.
8. Test SDK failure modes: blocked `content.overwolf.com`, timeout, missing `OwAd`,
   constructor exception, and shutdown rejection. Confirm the strip is blank rather than a
   fake ad and that the input remains usable.
9. Confirm the empty reserved strip during no-fill/SDK failure is acceptable to QA.
10. Check whether opening Settings occludes the ad; if it does, change the window flow so a
    pop-up does not block the ad container.
11. Re-check the policy pages and the OwAd reference at submission time; the documentation
    reviewed here is dated 2026-11-08 and can change.

## Local checks

Run the ad tests directly (the sandbox used here blocks Node's test-runner child spawn):

```powershell
node tests/overlay-ads.test.cjs
node tests/regressions.test.cjs
```

At the time of this note, the ad suite passes. The regression suite passes all 89
non-GameList tests in this environment; four pre-existing GamesList/XML tests fail because
`spawnSync(powershell.exe)` is blocked with `EPERM` by the sandbox. Those tests are outside
this change and were not modified to hide the environment failure.

Static/syntax checks performed:

```powershell
node --check quicktype-overlay/overlay-ads.js
node --check quicktype-overlay/overlay.js
node --check quicktype-overlay/window-geometry.js
node --check quicktype-overlay/config.js
node -e "JSON.parse(require('fs').readFileSync('quicktype-overlay/manifest.json','utf8'))"
```

No packaging, submission, commit, or push was performed. `c-h/` was left untouched.

## Local visual preview

Open `quicktype-overlay/overlay.html?ad-preview=1` in a browser to see the filled 400×60 preview beneath the input. Browser mode never loads the ad SDK. Inside Overwolf the same query parameter explicitly selects preview mode; ordinary app launch uses the real SDK container. The labelled preview is a separate sibling, never a child of or an overlay over an active SDK container. It is a layout mock, not proof of live ad delivery.
