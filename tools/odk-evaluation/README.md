# Isolated ODK evaluation

This prototype is outside the loaded extension. It runs the published ODK against synthetic Native responses and builds a browser bundle into the ignored `.work/` directory. It does not launch Overwolf, create an app package or test actual in-game input.

From the repository root, with Node 22+:

```powershell
npm install --prefix .work/odk-evaluation --ignore-scripts --no-audit --no-fund --save-exact @overwolf/odk-ts@1.1.2 @overwolf/types@3.51.1 esbuild@0.25.12
node tools/odk-evaluation/probe.cjs
```

All direct versions are pinned. Dependencies and the generated bundle remain in `.work/`. The production extension has no npm dependency or browser build step. See the [decision](../../docs/decisions/002-window-management-odk.md) for results and limits.
