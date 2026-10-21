# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- An English-only interface with the theme button in the title bar, separated from the window controls; the language switch and localization infrastructure have been removed.
- Automatic system font enumeration when settings open where Local Font Access API is available, with permission handling, deduplicated families and persistence of the selected font. The built-in list remains available when enumeration is unsupported or denied.
- Two desktop settings tabs: Connection and Overlay, with keyboard navigation.
- Portable connection JSON import/export, file selection and drag-and-drop, native file saving and clipboard copy.
- Overlay font family and size settings with live preview.
- Settings and close buttons in the overlay header, plus a dismiss button for errors.
- A single README with English and Russian sections, language navigation and the keyboard layout focus workaround.
- In-window overlay appearance preview, selected preset indicators, and persistent save footer with unsaved-change status.
- Explanatory descriptions for behavior toggles clarifying draft preservation on Esc and submit.
- Dynamic auto-height for overlay when typing multiline messages.
- Independent System / Dark / Light desktop themes; the theme applies immediately and is saved separately from overlay settings.

### Changed
- Overlay readability and focus: enlarged default input text to 18px, improved contrast and opacity, simplified to a single clear focus frame, and removed the placeholder from the input field.
- Overlay initial height reduced to a compact 100px with calm window contour.
- Streamlined footer shortcuts: “Enter — Send · Esc — Close” with secondary newline hint.
- Renamed the test section to “Speech test” with a “Send” button and accurate “Service accepted the text” status.
- Compact connection form with an HTTP method selector and URL field without redundant visible labels, collapsible headers and body template, and no default service URL for new installations.
- Launching the app or clicking its hub icon opens the input window on the desktop or in-game; settings are accessible from the overlay.
- Redesigned application icons and desktop titlebar, with a theme toggle in the titlebar.
- Delayed sending feedback banner shown only when network delay exceeds 800ms.
- Separate REST request preparation from transport execution, share appearance filtering between windows, and simplify submission state and test response rendering.

### Fixed
- Open the native color picker only from its swatch, rather than from the full-width background color heading.
- Reject empty and whitespace-only speech test input instead of sending an implicit fallback phrase.
- Pass the content rectangle and callback in the correct positions to the Overwolf resize API.
- Preserve automatic overlay height adjustment across programmatic resize events and avoid saving those events as manual geometry.
- Cancel native folder export without writing a fallback file; report clipboard failure accurately and expose JSON for manual copying.
- Discard pending import reads when a later selected file exceeds the size limit.
- Include the manifest's ICO icon in the distribution file list.
- Write valid ICO directory entries for the 256×256 image so all embedded icons load correctly.
- Keep automatic height enabled when an untouched overlay is closed and reopened.
- Prevent a pending import file read from replacing exported JSON in the import field.
- Run regression tests in CI and before release packaging.

### Known limitations
- Switching keyboard layouts while the overlay is open may lose focus. Hide the overlay, switch layouts, then show it again. No solution is currently available.
- In-game focus, resizing, Windows scaling, native dialogs and OBS capture still require manual verification for the release candidate.

## [0.3.0] - 2026-10-11

### Added
- In-game overlay 8 perimeter resize handles (top, bottom, left, right, and 4 corner grips) via `overwolf.windows.dragResize`.
- Multiline input support in the in-game overlay (`Enter` sends request, `Shift+Enter` inserts newlines).
- Custom titlebar for the desktop settings window with dragging, minimize (`_`), and close (`×`) controls, eliminating Overwolf's unwanted in-game opacity dropdown.
- Dismiss button (`×`) for the desktop test request response panel.
- Repositioned color picker to the leftmost position before theme chips with high-contrast borders and swatch styling.
- Out-of-the-box default configuration targeting the local TTSBard service (`http://127.0.0.1:10101/v1/speech`).

### Fixed
- Simplified submission feedback: removed glowing/pulsing borders and top status banner; errors now appear quietly below the input field without red outlines.
- Preserve drafts when reopening the overlay and ignore replies from dismissed requests.
- Correlate submissions with request IDs; repeated focus events no longer unlock pending input.
- Honor the Escape setting, preview appearance changes, and preserve independently saved geometry.
- Restore saved bounds and save moves as well as resizes.
- Preserve literal dollar sequences and plain-text payloads; append GET parameters before fragments.
- Validate header objects and HTTP URLs; limit full response wait to 15 seconds without automatic retries.
- Prevent overlapping desktop tests and correct existing GamesList values, including tags preceding ID.
- Align documentation with confirmed submission behavior and qualify OBS compatibility claims.

### Changed
- Require Overwolf 0.250.0 for the documented requestOverlayFocus API.

## [0.2.3] - 2026-10-10

### Added
- Native HTTP request bridge (`overwolf.web.sendHttpRequest`) to bypass browser CORS restrictions for `localhost` and `127.0.0.1` endpoints.
- Detailed diagnostic telemetry panel in desktop test block showing response status, response body, and network error explanations.

### Changed
- Streamlined desktop settings UI layout and hint texts.
- Fixed desktop settings window geometry to 600x800 with resizing disabled.

## [0.2.2] - 2026-10-10

### Added
- Twitch-inspired dark overlay theme (`#18181b` background, accent purple/violet `#9146ff` highlights).
- Custom toggle switches for settings.
- Dedicated interactive request testing block with live preview.

### Fixed
- Hotkey input leakage and unwanted auto-repeat behavior.
- Window docking and auto-focus retention when restoring in-game overlay.

## [0.2.0] - 2026-10-10

### Added
- Rebranded application to **QuickType**.
- Autonomous two-window architecture:
  - **Desktop Settings Window (`desktop.html`)**: Target REST/Webhook URL, HTTP method (GET/POST/PUT), dynamic JSON template with `{text}` variable substitution, custom headers, and overlay size customization.
  - **In-Game Overlay (`overlay.html`)**: High-performance transparent overlay with exclusive keyboard capture (`ReleaseOnHidden`), zero frame lag, auto-submit on Enter, and instant cancel on Escape.
  - **Background Controller (`background.html`)**: Global hotkey (`Ctrl+Shift+F9`) coordination, overlay focus orchestration (`bringToFront` + `requestOverlayFocus`), and asynchronous HTTP dispatch.
- Automated distribution packaging script (`scripts/package-app.ps1`).

## [0.1.10] - 2026-10-10

### Added
- In-game keyboard focus capture fix for games without visible hardware mouse cursor (e.g. *Cult of the Lamb*).
- Root-cause identification of Overwolf `MixMode` deadlock and mitigation via `GamesList.xml` (`DisableSmartMixMode`, `NotAllowMixedMode`).
- Automated patching utility `scripts/patch-overwolf-gamelist.js`.

### Changed
- Hotkey handler switched to `action-type: "custom"` for reliable overlay toggling.
