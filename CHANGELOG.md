# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Connection and Overlay settings tabs with keyboard navigation and a persistent Save bar that shows unsaved changes.
- Connection sharing through JSON import/export, including file selection, drag-and-drop, pasted JSON, file saving and clipboard copy. Profiles contain connection settings only; overlay appearance and behavior stay unchanged.
- Overlay font family and size controls with live preview. Installed fonts are available when the browser engine supports access and permission is granted; otherwise, the built-in font list remains available.
- Automatic overlay height adjustment for multiline messages.
- Settings and close buttons in the input window, plus a dismiss button for errors.
- A light/dark theme toggle for settings. The system theme is used by default, and an explicit choice is saved independently of overlay appearance.
- English and Russian user guides, a bilingual README and an importable TTSBard connection example.

### Changed
- Launching QuickType or clicking its hub icon now opens the input window on the desktop or over a game. Settings open separately from the input window.
- Both application windows now use English for labels, errors and statuses. User input and server responses are preserved as received.
- The input window starts at a compact 100px height, uses larger text (18px by default), and has improved contrast for dark and light backgrounds.
- Settings have a more compact layout, consistent spacing and refreshed icons. The window automatically fits the Overlay tab to its content, including font access messages.
- New installations start with an empty service URL. Existing saved connections are retained. Headers and the request body template are grouped under advanced request options.
- The Speech test section uses a Send button and reports when the service accepts the request; this does not confirm audio playback. Response details collapse on success and open on failure. The dismiss button is available beside the status even when details are collapsed.
- Sending feedback appears only when a request takes longer than 800ms; short requests do not show a sending banner.

### Fixed
- Reject empty or whitespace-only speech test input before sending a request.
- Correct in-game window resizing and prevent automatic size changes from disabling further height adjustment. Closing and reopening an untouched overlay also preserves automatic height adjustment.
- Open the native color picker only from its swatch.
- Correct launcher icon rendering and include the required icon in packaged app resources.
- Cancelling an export dialog no longer writes a fallback file. Clipboard failures expose the JSON for manual copying instead of reporting a successful copy.
- Prevent an older import file read from overwriting a newer selection or exported JSON.

### Known limitations
- Switching keyboard layouts while the overlay is open may lose focus in some games. Hide the overlay, switch layouts, then show it again.
- In-game focus and resizing, Windows scaling, native dialogs and OBS capture still require manual verification before release.

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
