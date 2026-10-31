# CLI Commands

The CLI is available at `node src/index.js <command> [options]`. The Electron UI wraps these commands with a graphical interface, but they can also be used directly.

## Pipeline Commands

### `analyze`

Analyzes CS:GO demo files and detects highlights such as kill series, knife kills, collaterals, and clutches.

```bash
node src/index.js analyze --demos <path> [--output <path>] [--reset-music]
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--demos <path>` | Yes | - | Path to folder containing `.dem` files |
| `--output <path>` | No | `./temp/output` | Output folder for `highlights.json` |
| `--reset-music` | No | - | Reset music mapping (discard existing offsets) |
| `--solo-kills-file <path>` | No | - | Path to JSON file with solo kills mapping |

By default, `analyze` preserves existing `offset` values in `music-mapping.json`. Use `--reset-music` to regenerate mapping from scratch.

**Solo kills**: Use `--solo-kills-file` to manually add single kill highlights. Get tick values from the `player-kills` command. Solo kills have the lowest priority (1) and will be removed if they collide with other highlights.

```bash
# Create a solo-kills.json file:
# {
#   "match.dem": [194953, 363443],
#   "other.dem": [12345]
# }

node src/index.js analyze --demos ./temp/demos --solo-kills-file ./temp/solo-kills.json
```

### `analyze-v2`

Simplified analyzer that outputs raw highlight data without calculating playback/speedup/slowmo. This enables a modular pipeline where each step can be re-run independently.

```bash
node src/index.js analyze-v2 --demos <path> [--output <path>]
```

| Feature | `analyze` | `analyze-v2` |
|---------|-----------|--------------|
| Points calculation | Yes | No (raw data only) |
| Playback boundaries | Yes | No (use `analyze-postprocess-ui`) |
| Speedup/Slowmo | Yes | No (use `analyze-postprocess-ui`) |
| Music mapping | Yes | No (separate command) |
| Kill metadata | Basic | Extended (flick, airborne, equipment) |

Each kill in v2 includes additional metadata:
- `flickAngle` / `isFlick` - Flick shot detection (angle change before kill)
- `airborne` - Whether attacker was in the air
- `attackerEquipmentValue` / `victimEquipmentValue` - Equipment value for eco frag detection

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--demos <path>` | Yes | `./temp/demos` | Path to folder containing `.dem` files |
| `--output <path>` | No | `./temp/output` | Output folder for `highlights.json` |
| `--solo-kills-file <path>` | No | - | Path to JSON file with solo kills mapping |

### `analyze-postprocess-ui`

Calculates playback boundaries, speedup segments, and slowmo triggers for highlights. Run this **after** `analyze-v2`.

```bash
node src/index.js analyze-postprocess-ui --highlights <path> [--output <path>]
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--highlights <path>` | No | `./temp/output/highlights.json` | Path to highlights file |
| `--output <path>` | No | `./temp/output/highlights_postprocess.json` | Output file path |

V2 pipeline example:

```bash
# Step 1: Parse demos (raw data)
node src/index.js analyze-v2 --demos ./temp/demos

# Step 2: Calculate playback/speedup/slowmo
node src/index.js analyze-postprocess-ui --highlights ./temp/output/highlights.json

# Step 3: Record (use highlights_postprocess.json)
node src/index.js record --highlights ./temp/output/highlights_postprocess.json
```

### `record`

Records all highlights using HLAE (Half-Life Advanced Effects). Produces raw video clips without effects.

```bash
node src/index.js record [options]
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--highlights <path>` | No | `./temp/output/highlights.json` | Path to `highlights.json` file |
| `--demos <path>` | No | `./temp/demos` | Path to folder containing `.dem` files |
| `--hlae <path>` | No | `C:\Program Files (x86)\HLAE\hlae.exe` | Path to HLAE executable |
| `--client <id>` | No | `legacy` | Game client HLAE launches: `legacy` = CS2 (app 730) with the `csgo_legacy` beta, `standalone` = CS:GO (app 4465480) |
| `--csgo <path>` | No | found via Steam | Install folder of the selected client (contains `csgo.exe`). When empty, it is found from `steamapps/appmanifest_<appId>.acf` in your Steam libraries |
| `--steam <path>` | No | `C:\Program Files (x86)\Steam` | Steam folder used to find the selected client |
| `--output <path>` | No | `./temp/output` | Output folder for clips |
| `--quality <preset>` | No | `medium` | Encoding quality preset |
| `--player <steamId>` | No | - | Filter highlights by player Steam ID |
| `--id <highlightId>` | No | - | Record only a specific highlight by ID |
| `--hud` | No | - | Record with HUD, chat, voice |
| `--voice` | No | - | Record with voice but without HUD (double-pass) |
| `--client-version <n>` | No | - | Pin `steam.inf` ClientVersion (abort if Steam updated the game) |
| `--server-version <n>` | No | - | Pin `steam.inf` ServerVersion |
| `--network-protocol <n>` | No | from `steam.inf` | Override the protocol every demo must match |
| `--skip-version-check` | No | - | Skip the demo vs. game compatibility check |

#### Game client

Recording runs a real game client, so you choose which one with `--client` (UI: **Game Client**). Before launching anything, `record` verifies that the folder really is that client: `csgo.exe` exists, `csgo/steam.inf` has the matching `appID`, and, for `legacy`, Steam has the `csgo_legacy` beta mounted.

#### Game version compatibility

Before launching HLAE, `record` checks that every demo it is about to record can be played by the selected client:

1. Reads `<csgo>/csgo/steam.inf` and derives the client's network protocol from `PatchVersion` (`1.38.8.1` → `13881`). `appID` identifies the client: `730` = CS2 with the `csgo_legacy` beta, `4465480` = standalone CS:GO.
2. Reads each demo's header (`networkProtocol`, game directory) and requires it to match the client. CS2 (Source 2) demos and demos from other games are rejected with a clear message.

All problems are reported at once. Demos recorded on either client (730 `csgo_legacy` or 4465480) share the same build (`13881`), so they are interchangeable as long as the installed game is on that build.

#### Quality Presets

| Preset | CRF | FFmpeg Preset | Description |
|--------|-----|---------------|-------------|
| `high` | 15 | slow | Best quality, ~3x slower encoding |
| `medium` | 18 | medium | Good quality, balanced speed (default) |
| `fast` | 20 | fast | Decent quality, fast encoding |
| `draft` | 23 | ultrafast | Preview quality, very fast |

#### Logs

The game is launched with `-condebug`, so its console is written to `<game>/csgo/console.log`. After every HLAE run, the part written during that run is saved to `<output>/logs/<clip>.console.log` together with `<clip>.hlae.log` (HLAE output). Both start with a header: client, game folder, demo, highlight ID, full HLAE command and exit status. With `--voice` each pass gets its own files (`.pass1-voice`, `.pass2-clean`). When a recording fails, the error shows the log paths and the console lines that look like errors.

**Note about `--hud`**: Enables voice and text chat from both teams, but also shows the full spectator HUD due to CS:GO limitations.

**Note about `--voice`**: Performs a double-pass recording to get voice audio without HUD. Takes ~2x the recording time. Cannot be used with `--hud`.

### `postprocess-ui`

Applies visual effects to recorded clips (slowmo, speedup, overlay). Tracks processed clips in `postprocess-status.json` to avoid re-processing.

```bash
node src/index.js postprocess-ui --highlights <path> [options]
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--highlights <path>` | Yes | - | Path to `highlights.json` file |
| `--clips <path>` | No | `./temp/output/clips` | Path to folder containing raw clips |
| `--output <path>` | No | `./temp/output/clips_processed` | Output folder for processed clips |
| `--speedup <multiplier>` | No | `3` | Speed up gaps between kills |
| `--overlay` | No | `true` | Show player name and highlight type overlay |
| `--slowmo <factor>` | No | `0.6` | Slow motion on last headshot/noscope kill |
| `--force` | No | - | Re-process all clips even if already processed |
| `--id <highlightId>` | No | - | Process only a specific highlight by ID |

Original clips are never modified. Post-processing status is saved in `postprocess-status.json` in the output folder.

### `postprocess-sound`

Applies music to already processed clips. Separate from `postprocess-ui` for fast music fine-tuning.

```bash
node src/index.js postprocess-sound --highlights <path> [--clips <path>] [options]
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--highlights <path>` | Yes | - | Path to `highlights.json` file |
| `--clips <path>` | No | `./temp/output/clips_processed` | Path to processed clips folder |
| `--output <path>` | No | `./temp/output/clips_final` | Output folder for clips with music |
| `--music <folder>` | No | `./temp/music` | Path to folder with music files |
| `--music-volume <percent>` | No | `70` | Music volume 0-100% |
| `--force` | No | - | Re-apply music even if already applied |
| `--id <highlightId>` | No | - | Apply music only to a specific highlight |

### `merge`

Merges recorded clips into a single video using FFmpeg.

```bash
node src/index.js merge --clips <path> [--output <path>] [--cleanup]
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--clips <path>` | Yes | - | Path to folder containing `.mp4` clip files |
| `--output <path>` | No | `./temp/output/highlights_final.mp4` | Output path for final video |
| `--cleanup` | No | - | Delete individual clips after merging |
| `--transition <duration>` | No | - | Add fade in/out transitions (duration in seconds) |

### `compress`

Compresses a video file to reduce file size using FFmpeg.

```bash
node src/index.js compress --input <path> [--power <level>] [--output <path>]
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--input <path>` | Yes | - | Path to input video file |
| `--power <level>` | No | `5` | Compression power 1-10 (1=light, 10=maximum) |
| `--output <path>` | No | `{input}_compressed.mp4` | Output path for compressed video |

| Power | CRF | Quality |
|-------|-----|---------|
| 1 | 18 | Minimal compression, highest quality |
| 5 | 26 | Balanced compression and quality |
| 10 | 36 | Maximum compression, lower quality |

## Utility Commands

### `player-kills`

Shows all kills by a specific player in a demo file. Useful for finding tick values for solo kills.

```bash
node src/index.js player-kills --demo <path> --steamid <id>
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--demo <path>` | Yes | - | Path to demo file (`.dem`) |
| `--steamid <id>` | Yes | - | Player Steam ID (64-bit format) |

### `timestamps`

Generates a list of highlight timestamps (accounting for speedup/slowmo effects) for video chapter markers.

```bash
node src/index.js timestamps --highlights <path> [--output <path>] [--speedup <multiplier>] [--slowmo <factor>]
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--highlights <path>` | Yes | - | Path to `highlights.json` file |
| `--output <path>` | No | `./temp/output/timestamps.txt` | Output file path |
| `--speedup <multiplier>` | No | `3` | Speedup multiplier used in postprocess |
| `--slowmo <factor>` | No | `0.6` | Slowmo factor used in postprocess |

Output format:
```
00:00:00 | 3K | de_mirage | mag-ua
00:00:17 | ACE | de_mirage | PlayerName
00:00:42 | 1v3 | de_dust2 | AnotherPlayer
```

### `top`

Selects the top N highlights by impressiveness score. Useful for creating highlight compilations from large datasets.

```bash
node src/index.js top [--highlights <path>] [--count <n>] [--output <path>] [options]
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--highlights <path>` | No | `./temp/output/highlights.json` | Path to `highlights.json` file |
| `--count <n>` | No | `10` | Number of top highlights to select |
| `--output <path>` | No | `./temp/output/highlights_top.json` | Output file path |
| `--asc` | No | - | Sort ascending (lowest score first) |
| `--show-scores` | No | - | Print detailed score breakdown |
| `--player <steamId>` | No | - | Filter by player Steam ID |
| `--type <type>` | No | - | Filter by highlight type |
| `--min-kills <n>` | No | - | Minimum kill count |
| `--unique-players <n>` | No | `1` | Max highlights per player |

The output file is compatible with other commands (`record`, `postprocess-*`, `timestamps`).

### `resync-music`

Recalculates music `startTime` and `endTime` based on manual `offset` values in `music-mapping.json`.

```bash
node src/index.js resync-music [--mapping <path>]
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--mapping <path>` | No | `./temp/output/music-mapping.json` | Path to music-mapping.json file |
