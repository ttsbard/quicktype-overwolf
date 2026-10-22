**English | [Русский](../../ru/user/developer-mode.md)**

# Overwolf Developer Mode

Your account needs developer access (whitelisting) to load and run unpublished QuickType through **Load unpacked extension**. See the [official Overwolf setup guide](https://dev.overwolf.com/ow-native/getting-started/onboarding-resources/setting-up-dev-environment/).

1. Visit the [Overwolf developer portal](https://dev.overwolf.com/) and follow the current registration process.
2. Submit accurate contact details and an app description. Overwolf decides whether to approve access and how long review takes; there is no guaranteed turnaround time.
3. After approval, sign in to the approved account in the Overwolf client and open **Development Options** using the official instructions.
4. Click **Load unpacked extension** and select `quicktype-overlay`, the folder containing `manifest.json`.
5. Launch QuickType. After editing the source files, manually **Reload** the app in **Development Options**. The manifest's automatic refresh settings are for development only; check manifest changes after a Reload.

Example app description: QuickType is an in-game app for entering text and integrating with apps and services through APIs. Users configure a compatible REST API or webhook; text-to-speech is one possible use case. This is a suggested description, not a required wording or application language.

If loading reports **Unauthorized App**, check that you are signed in to the correct account and that developer access has been granted. The app currently requires Overwolf 0.250.0 or later.
