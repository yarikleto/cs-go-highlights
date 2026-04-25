# Game Version Compatibility Check — Design

**Date:** 2026-04-26
**Status:** Approved (pending user spec review)

## Problem

CS:GO demo files (`.dem`) only replay correctly under the game build they were recorded on. Steam can auto-update the installed game, silently breaking HLAE-based recording for any older demos. The user manually pins `steam.inf` to match the demos' build (e.g. `ClientVersion=2000335`, `ServerVersion=2000335`), but there is currently no programmatic guard: if Steam later overwrites `steam.inf`, the pipeline still runs and produces broken recordings.

## Goal

Detect game/demo version mismatch *before* any heavy work (analyze or record), and fail fast with a clear, actionable error.

## Non-goals

- Automatically editing `steam.inf` to restore versions (user's responsibility).
- Maintaining a mapping table between Steam build numbers and demo `networkProtocol` values.
- Recovering from mismatch (e.g. version-tolerant replay).

## Design

### 1. Config

Add a new section to `src/config.js`:

```js
export const GAME_VERSION = Object.freeze({
  clientVersion: 2000335,   // expected ClientVersion in steam.inf
  serverVersion: 2000335,   // expected ServerVersion in steam.inf
  networkProtocol: null,    // expected demo header.networkProtocol; null = only check batch consistency
});
```

Rationale for three numbers: `clientVersion` / `serverVersion` describe the installed game (steam.inf), `networkProtocol` describes the demo file. They live in different number spaces, so we cannot derive one from the other — both are stored explicitly.

`networkProtocol: null` means "do not require a specific value, but ensure all demos in a batch share the same protocol". Once the user runs the pipeline once and sees the actual protocol number in logs, they can pin it in config to enable strict matching.

### 2. New module: `src/cli/services/versionCheck.js`

```js
export class VersionMismatchError extends Error {
  constructor(reasons) { ... this.reasons = reasons; }
}

// Parse <csgoPath>/csgo/steam.inf, extract ClientVersion & ServerVersion as numbers.
// Throws if file missing or required keys not found.
export function readSteamInf(csgoPath) → { clientVersion, serverVersion }

// Read only the demo header (no full parse).
// demofile already exposes header parsing on the `start` event; we'll either reuse
// that path (parse minimal bytes) or wrap a small custom reader of the 1072-byte
// CS:GO demo header. Returns { file, networkProtocol, protocol, mapName, ... }.
export function readDemoHeader(filePath) → { file, networkProtocol, ... }

// Single entry point for both analyze and record commands.
// csgoPath is optional — analyze does not need it.
// Collects ALL violations into one error so the user sees everything at once.
export function assertVersionCompatibility({
  csgoPath,        // string | undefined — when provided, steam.inf is checked
  demoHeaders,     // Array<{ file, networkProtocol }>
  expected,        // { clientVersion, serverVersion, networkProtocol }
}) → void
```

Validation rules inside `assertVersionCompatibility`:

1. If `csgoPath` is provided → read `steam.inf`, compare its `ClientVersion`/`ServerVersion` against `expected.clientVersion`/`expected.serverVersion`. Mismatch on either → record reason.
2. If `expected.networkProtocol` is non-null → every demo header must equal it. Each mismatch is its own reason (named per file).
3. If `expected.networkProtocol` is null → all demo headers must share the same `networkProtocol`. If they diverge, record one reason listing the offending files.
4. If any reasons accumulated → throw `VersionMismatchError(reasons)`.

### 3. Integration points

| Command | Checks performed | When |
|---|---|---|
| `analyze-v2` | demos mutually consistent + (optional) match `expected.networkProtocol` | after listing `.dem` files, before spawning parser workers |
| `record` | `steam.inf` ↔ config + demos mutually consistent + (optional) match `expected.networkProtocol` | at start of command, before any HLAE spawn |

Both commands fail fast — the `VersionMismatchError` is caught at the CLI top level, formatted to a multi-line message, and `process.exit(1)` is called. In the Electron flow the error propagates through `commandRunner.js` as a non-zero exit and is surfaced in the renderer the same way other command failures already are.

### 4. CLI and Electron UI surface

Add three new option entries to **both** `analyze-v2` and `record` in `src/shared/commands.json`:

```json
{ "name": "client-version",   "label": "Expected ClientVersion",
  "type": "number", "default": 2000335,
  "description": "From steam.inf — Steam build number the demos were recorded on" },
{ "name": "server-version",   "label": "Expected ServerVersion",
  "type": "number", "default": 2000335,
  "description": "From steam.inf — must match ClientVersion in practice" },
{ "name": "network-protocol", "label": "Expected Demo NetworkProtocol",
  "type": "number",
  "description": "From demo header. Leave blank to only verify all demos in the batch agree." }
```

Plus a fourth flag on both commands:

```json
{ "name": "skip-version-check", "label": "Skip Version Check",
  "type": "boolean", "default": false,
  "description": "Bypass the game/demo version compatibility check (use only if you know what you're doing)" }
```

The existing form generator in the Electron UI consumes `commands.json` and will surface these as form fields automatically — no renderer changes required.

CLI command files (`src/cli/commands/analyzeV2.js`, `record.js`) read these options, fall back to `GAME_VERSION` defaults from `src/config.js`, and pass the resulting `expected` object plus `csgoPath`/`demoHeaders` into `assertVersionCompatibility`. When `skip-version-check` is true, the call is bypassed and a warning is logged.

### 5. Error format

Single multi-line error message printed at CLI exit:

```
Game version compatibility check failed:
  • steam.inf ClientVersion=2000336 does not match expected 2000335
    (Steam may have auto-updated CS:GO — restore steam.inf or update config)
  • Demo "match1.dem" has networkProtocol=13780, expected 13753
  • Demos use mixed networkProtocol: match1.dem=13780, match2.dem=13753

Use --skip-version-check to bypass (not recommended).
```

The `steam.inf` reason includes the remediation hint inline so the user does not need to look up what to do next.

### 6. Testing

Repo has no test infrastructure. Manual verification scenarios:

- **Match path:** unmodified `steam.inf`, demos from same build, config defaults → analyze and record both proceed silently.
- **steam.inf drift:** edit `steam.inf` to a different `ClientVersion` → record fails with the steam.inf reason.
- **Mixed batch:** drop a demo from a different build into `./demos` → analyze fails with the mixed-protocol reason.
- **Strict pin:** set `networkProtocol` in config, drop in a demo from a different build → analyze fails with the per-file reason.
- **Bypass:** add `--skip-version-check` → all of the above proceed with a warning.

### 7. Out of scope / YAGNI

- No automatic remediation of `steam.inf`.
- No bundled lookup table mapping Steam build → networkProtocol.
- No GUI for editing `GAME_VERSION` defaults inside Electron — values are per-run command options; if persistence across runs is needed later, that's a separate feature.
- No retroactive check on already-produced highlight JSON files.

## Files touched

- `src/config.js` — add `GAME_VERSION` section.
- `src/cli/services/versionCheck.js` — new module (parsing + assertion + error class).
- `src/cli/commands/analyzeV2.js` — pre-check before workers.
- `src/cli/commands/record.js` — pre-check before HLAE spawn.
- `src/shared/commands.json` — four new options on `analyze-v2` and `record`.
- (Optional) top-level CLI error handler in `src/cli/index.js` — pretty-print `VersionMismatchError` if not already covered by existing handler.
