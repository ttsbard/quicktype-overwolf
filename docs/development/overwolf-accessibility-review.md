# Accessibility review and monetization

Status: correspondence draft; not sent. No monetization exception or ad placement approval has been granted. Prepare the candidate locally, request an exception first, then decide the resubmission route from Overwolf's response.

## Email to Developer Relations

Subject: QuickType — accessibility use case and request for a monetization exception

Hi Overwolf Developer Relations Team,

Thank you for reviewing QuickType and explaining the monetization requirement.

Before resubmitting, could you consider an exception allowing QuickType to be distributed free of charge and without advertising because of its accessibility use case?

QuickType provides a keyboard-operated text input overlay over a game. It sends typed text to a user-configured HTTP service. When connected to a compatible text-to-speech service, it can help players with speech disabilities, including players who cannot speak, communicate while gaming. Speech synthesis and audio routing are provided by the external service and the user's setup, rather than by QuickType itself.

The intended interaction is brief and repeated: open the input with a hotkey, type a phrase, send it, and return immediately to the game. Advertising beneath the input could therefore appear during every communication attempt, enlarge the overlay, and distract from a function users may rely on to communicate. Keeping the window open solely to increase ad exposure would also conflict with this interaction.

Would you consider an accessibility exception to the monetization requirement for this app? If an exception is unavailable, would a single 400×60 Overwolf ad container directly below the main input be acceptable despite these short, repeated sessions? We would retain immediate sending and dismissal and would not force users to wait for advertising. Please also advise on any game-specific restrictions and the desktop-window requirement for an app whose main window is this input overlay.

We will follow your guidance before resubmitting the revised build and review materials.

Best regards,
Aleksey

## Revised application description

QuickType is a keyboard-operated in-game text input overlay that sends typed messages to a user-configured REST API or webhook without switching away from the game. An important accessibility use case is connecting a compatible text-to-speech service so players with speech disabilities, including players who cannot speak, can communicate through typed phrases. QuickType handles text input and HTTP delivery; speech synthesis and audio routing depend on the chosen external service and the user's setup. The overlay supports a configurable hotkey, adjustable text appearance, multiline input, and draft preservation on failed requests.

## Resubmission order

1. Send the exception request as a reply to the original Developer Relations message. Record their response before selecting an ad-free or monetized submission route.
2. Review the implemented candidate and perform actual Overwolf/game checks: input focus, send, Escape, hotkey toggling, repeated opens, resizing, SDK failure and ad visibility. Automated checks alone do not establish runtime compatibility or advertising approval.
3. If ads are required, obtain guidance on short overlay sessions and game-specific restrictions. Do not claim the placement has already been approved or that ads have been enabled.
4. Capture current English screenshots of every visible window/tab and provide reproducible test instructions, including any external HTTP service required. Avoid exposing connection credentials.
5. Create an OPK only when explicitly requested, then submit the verified build through the review form. Do not check QA confirmations until the corresponding manual checks have actually been performed.

Review form: https://wkf.ms/3KL8b1m (Submitting Your First Build).

Official references checked on 2026-11-08:

- https://dev.overwolf.com/ow-native/monetization/overview/
- https://dev.overwolf.com/ow-native/monetization/advertising/overview/
- https://dev.overwolf.com/ow-native/monetization/advertising/standard-ads/working-with-ads/
- https://dev.overwolf.com/ow-native/reference/ads/owad/

The published ad planning guidelines prohibit ads on settings pages and require meaningful content and adequate visibility. They do not establish approval of this candidate's short sessions. The form also asks whether at least one desktop window remains open while the app is running; confirm how this applies to QuickType before resubmission.
