# CS:GO Highlights Tool

A Node.js CLI tool that parses CS:GO demo files (`.dem`) to automatically detect impressive gameplay moments (highlights) and outputs structured data for video editing.

## Installation

```bash
npm install
```

## Quick Start

```bash
node src/index.js analyze --demos ./demos --output ./output
```

This will analyze all `.dem` files in the `./demos` folder and generate `highlights.json` in the `./output` folder.

## Commands

### `analyze`

Analyzes CS:GO demo files and detects highlights such as kill series, knife kills, collaterals, and clutches.

```bash
node src/index.js analyze --demos <path> [--output <path>] [--reset-music]
```

#### Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--demos <path>` | Yes | - | Path to folder containing `.dem` files |
| `--output <path>` | No | `./output` | Output folder for `highlights.json` |
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

node src/index.js analyze --demos ./demos --solo-kills-file ./solo-kills.json
```

#### Example

```bash
node src/index.js analyze --demos ./my-demos --output ./results
```

### `record`

Records all highlights using HLAE (Half-Life Advanced Effects). Produces **raw video clips without effects**.

```bash
node src/index.js record [options]
```

**Quick example** (uses defaults for standard Windows paths):

```bash
# Simple - uses all defaults
node src/index.js record

# Fast preview quality
node src/index.js record --quality draft

# Custom paths (if HLAE/CS:GO not in default locations)
node src/index.js record --hlae "D:\HLAE\hlae.exe" --csgo "D:\Games\CS-GO"
```

#### Prerequisites

- **HLAE**: Download from [https://www.advancedfx.org/](https://www.advancedfx.org/)
- **FFmpeg**: Must be installed and available in PATH. Download from [https://ffmpeg.org/](https://ffmpeg.org/)
- **CS:GO Legacy**: You must have the **Legacy Version of CS:GO** installed (not CS2). To install it:
  1. In Steam, right-click Counter-Strike 2 → Properties → Betas
  2. Select "csgo_legacy - Legacy Version of CS:GO"
  3. Or when launching, choose "Play Legacy Version of CS:GO"
  
  The legacy version is typically installed at:
  `C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive`
  
  **Note**: HLAE does not support Counter-Strike 2. Only the legacy CS:GO version is compatible.

#### Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--highlights <path>` | No | `./output/highlights.json` | Path to `highlights.json` file |
| `--demos <path>` | No | `./demos` | Path to folder containing `.dem` files |
| `--hlae <path>` | No | `C:\Program Files (x86)\HLAE\hlae.exe` | Path to HLAE executable |
| `--csgo <path>` | No | `C:\Program Files (x86)\Steam\...` | Path to CS:GO installation folder |
| `--output <path>` | No | `./output` | Output folder for clips |
| `--quality <preset>` | No | `medium` | Encoding quality preset (see below) |
| `--player <steamId>` | No | - | Filter highlights by player Steam ID |
| `--id <highlightId>` | No | - | Record only a specific highlight by ID (for debugging) |
| `--voice-chat` | No | - | Enable voice chat and text chat in recordings |

#### Quality Presets

Control the trade-off between encoding speed and video quality:

| Preset | CRF | FFmpeg Preset | Description |
|--------|-----|---------------|-------------|
| `high` | 15 | slow | Best quality, ~3x slower encoding |
| `medium` | 18 | medium | Good quality, balanced speed (default) |
| `fast` | 20 | fast | Decent quality, fast encoding |
| `draft` | 23 | ultrafast | Preview quality, very fast |

```bash
# Fast recording for preview
node src/index.js record --quality draft

# High quality for final export
node src/index.js record --quality high
```

**Note about `--voice-chat`**: This flag enables voice and text chat from both teams, but due to CS:GO limitations, it also shows the full spectator HUD (player panels, radar, etc.). There is no way to show only chat without the rest of the HUD in demo playback mode.

### `postprocess-ui`

Applies visual effects to recorded clips (slowmo, speedup, overlay). Tracks processed clips in `postprocess-status.json` to avoid re-processing.

```bash
node src/index.js postprocess-ui --highlights <path> [options]
```

**Example:**

```bash
# Uses defaults: speedup 3x, overlay enabled, slowmo 0.6x
node src/index.js postprocess-ui --highlights ./output/highlights.json --clips ./output/clips
```

#### Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--highlights <path>` | Yes | - | Path to `highlights.json` file |
| `--clips <path>` | No | `./output/clips` | Path to folder containing raw clips |
| `--output <path>` | No | `./output/clips_processed` | Output folder for processed clips (originals preserved) |
| `--speedup <multiplier>` | No | `3` | Speed up gaps between kills (e.g., `4` for 4x speed) |
| `--overlay` | No | `true` | Show player name and highlight type overlay (fade in/out) |
| `--slowmo <factor>` | No | `0.6` | Slow motion on last headshot/noscope kill (e.g., `0.5` for half speed) |
| `--force` | No | - | Re-process all clips even if already processed |
| `--id <highlightId>` | No | - | Process only a specific highlight by ID |

#### Tracking & Output

- **Original clips are never modified** — they remain in the source folder
- Processed clips are saved to `--output` folder (default: `./output/clips_processed`)
- Post-processing status is saved in `postprocess-status.json` in the output folder
- Clips are only re-processed if settings change or `--force` is used

#### Recording Settings

Default recording settings (high quality, hardcoded):
- Resolution: 1920x1080 (Full HD)
- Framerate: 60 FPS
- Codec: H.264 (libx264)
- Quality: CRF 15 (very high quality)
- Preset: slow (better compression)
- Audio: AAC 320kbps

#### Automatic CS:GO Setup

The `record` command automatically configures CS:GO for optimal highlight recording. **Your normal game settings are NOT modified** - these settings are applied only during the recording session via a temporary CFG file.

Settings automatically applied during recording:

| Category | Settings |
|----------|----------|
| **HUD** | Minimal (only death notices visible, killfeed filtered to highlight player) |
| **Viewmodel** | Visible (r_drawviewmodel 1) |
| **Crosshair** | Classic green static crosshair (consistent for all highlights) |
| **Camera** | Locked to highlight player (spec_lock 1) |
| **X-Ray** | Disabled (spec_show_xray 0) |
| **Overlays** | Disabled (net_graph 0, cl_showfps 0) |
| **Music** | Muted (all music volumes set to 0) |
| **Voice** | Muted by default (use `--voice-chat` to enable, but shows full HUD) |
| **Graphics** | High quality (HDR, postprocessing enabled) |
| **Tracers** | Enabled (r_drawtracers_firstperson 1) |

After recording completes, CS:GO closes and your original settings remain unchanged in your config files.

#### Examples

Record all highlights:

```bash
node src/index.js record --highlights ./output/highlights.json --demos ./demos --hlae "C:\Program Files (x86)\HLAE\hlae.exe" --csgo "C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive"
```

**Important**: The `--csgo` path must point to the Legacy CS:GO installation folder containing `csgo.exe`, not CS2.

Record only highlights from a specific player:

```bash
node src/index.js record --highlights ./output/highlights.json --demos ./demos --hlae "C:\Program Files (x86)\HLAE\hlae.exe" --csgo "C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive" --player 76561198012345678
```

Record a single highlight by ID (useful for debugging):

```bash
node src/index.js record --highlights ./output/highlights.json --demos ./demos --hlae "C:\Program Files (x86)\HLAE\hlae.exe" --csgo "C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive" --id b8c4f695d6d9
```

Record highlights with 4x speedup during gaps between kills:

```bash
node src/index.js record --highlights ./output/highlights.json --demos ./demos --hlae "C:\Program Files (x86)\HLAE\hlae.exe" --csgo "C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive" --speedup 4
```

#### Speedup (Clutches & Kill Series)

When using `--speedup`, long gaps between action are sped up using FFmpeg post-processing:

- Works for both **clutches** and **kill series** (multi kills)
- Keeps 2 seconds of normal speed before/after each action
- Only speeds up gaps longer than 4 seconds
- Applies to both video and audio (audio uses atempo filter)
- Works with any speed multiplier (e.g., `--speedup 2`, `--speedup 4`, `--speedup 8`)

**Smart action detection:**
- Detects **all player shots** (not just kills) — speedup won't activate while shooting
- Includes **knife kills** as action points (melee attacks don't have weapon_fire events)
- Groups consecutive shots into "action periods" for smooth transitions

This makes long highlights more watchable while preserving all action moments at normal speed.

#### Player Overlay

When using `--overlay`, a player info overlay is displayed in the bottom-left corner:

- **Player name** (large white text)
- **Highlight type** (smaller yellow text: "1V4 CLUTCH", "ACE", "4K", "KNIFE KILL", etc.)
- Fade in (0.5s), display (2.5s), fade out (0.5s)
- Semi-transparent dark background for readability

Example with overlay:

```bash
# Overlay is enabled by default
node src/index.js record --highlights ./output/highlights.json --demos ./demos --hlae "C:\Program Files (x86)\HLAE\hlae.exe" --csgo "C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive"
```

Combine with speedup:

```bash
# Custom speedup (4x instead of default 3x)
node src/index.js record --highlights ./output/highlights.json --demos ./demos --hlae "C:\Program Files (x86)\HLAE\hlae.exe" --csgo "C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive" --speedup 4
```

#### Slow Motion

When using `--slowmo` with `postprocess-ui`, an "impact" slow motion effect is applied:

**For kill-series and clutches:**
- Finds the **last headshot or noscope kill** in the series (not necessarily the final kill)
- Example: `[body, headshot, body]` → slowmo on the headshot (middle kill)

**For collaterals:**
- **Always** applies slowmo (collaterals are always impressive)

**Qualifying kills:**
- A **headshot**, OR
- A **noscope** sniper shot

**Effect style:**
- **Instant slowdown** at the kill moment (dramatic impact)
- **Gradual ramp-up** back to normal speed over 0.6 seconds
- Creates a cinematic "bullet time" effect

**Settings:**
- **Factor**: Peak slowdown (e.g., `0.25` = quarter speed at impact, then ramp to normal)
- Applies to both video and audio

Example with slow motion:

```bash
# Override default slowmo (0.6) with custom value
node src/index.js postprocess-ui --highlights ./output/highlights.json --slowmo 0.5
```

Combine all effects:

```bash
node src/index.js postprocess-ui --highlights ./output/highlights.json --speedup 4 --overlay --slowmo 0.5
```

#### Music Overlay

Add background music to your clips during post-processing.

**Setup:**
1. Create a `music/` folder in your project directory
2. Add audio files (MP3, WAV, FLAC, OGG, M4A, AAC)

**How it works:**
- `analyze` command generates `music-mapping.json` alongside `highlights.json`
- Each clip is assigned a unique segment of music (no reuse between clips)
- Music plays sequentially through all clips
- When a track ends, the next track in the folder is used
- Music fades in/out at clip boundaries (50% → 100% → 50%)

**Example:**

```bash
node src/index.js postprocess-ui --highlights ./output/highlights.json --music ./music --music-volume 70
```

Post-process without music:

```bash
node src/index.js postprocess-ui --highlights ./output/highlights.json --no-music
```

**Music behavior with effects:**
- **Speedup**: Music plays at normal speed (not sped up)
- **Slowmo**: Music plays at normal speed

**music-mapping.json** structure:

```json
{
  "tracks": [
    { "path": "music/track.mp3", "duration": 300.5 }
  ],
  "clips": {
    "ced8b2df3663": {
      "track": "music/track.mp3",
      "startTime": "0:00",
      "endTime": "0:45",
      "duration": "0:45",
      "offset": "0:00",
      "overrideStartTime": "5:30"
    }
  }
}
```

**Manual Music Offset:**

You can manually adjust music timing for individual clips by editing the `offset` field in `music-mapping.json`:

- `"offset": "1:30"` — shift music 1 minute 30 seconds forward (skip intro)
- `"offset": "-0:30"` — shift music 30 seconds backward (NOT RECOMMENDED, use positive offsets)

After editing offsets, run `resync-music` to recalculate times:

**Override Start Time (hack):**

Use `overrideStartTime` to completely override the calculated `startTime` for a specific clip:

- `"overrideStartTime": "5:30"` — use music starting at 5:30 regardless of calculated position
- Does NOT affect `startTime`/`endTime` calculations for other clips
- Takes priority over `startTime` when present during postprocess
- Preserved when running `analyze` (unless `--reset-music` is used)

```bash
node src/index.js resync-music
```

### `resync-music`

Recalculates music `startTime` and `endTime` based on manual `offset` values in `music-mapping.json`.

```bash
node src/index.js resync-music [--mapping <path>]
```

#### Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--mapping <path>` | No | `./output/music-mapping.json` | Path to music-mapping.json file |

#### Workflow

1. Run `analyze` — generates `music-mapping.json` with `offset: 0` for all clips
2. Edit `offset` values manually in `music-mapping.json`
3. Run `resync-music` — recalculates `startTime` and `endTime`
4. Run `postprocess-sound` — applies music to processed clips

### `postprocess-sound`

Applies music to already processed clips. Separate from `postprocess-ui` for fast music fine-tuning.

```bash
node src/index.js postprocess-sound --highlights <path> [--clips <path>] [options]
```

#### Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--highlights <path>` | Yes | - | Path to `highlights.json` file |
| `--clips <path>` | No | `./output/clips_processed` | Path to processed clips folder (input) |
| `--output <path>` | No | `./output/clips_final` | Output folder for clips with music |
| `--music <folder>` | No | `./music` | Path to folder with music files |
| `--music-volume <percent>` | No | `70` | Music volume 0-100% |
| `--force` | No | - | Re-apply music even if already applied |
| `--id <highlightId>` | No | - | Apply music only to a specific highlight |

#### Workflow for Music Fine-tuning

1. Run `postprocess-ui` with visual effects (slowmo, speedup, overlay) → `clips_processed/`
2. Run `postprocess-sound` to add music → `clips_final/`
3. Edit `music-mapping.json` (adjust `offset` or `overrideStartTime`)
4. Run `resync-music` if you changed `offset` values
5. Run `postprocess-sound --force` to re-apply music with new settings
6. Repeat steps 3-5 until satisfied

**Example:**

```bash
# Apply music to all processed clips
node src/index.js postprocess-sound --highlights ./output/highlights.json

# Re-apply music to a specific clip after editing mapping
node src/index.js postprocess-sound --highlights ./output/highlights.json --force --id ced8b2df3663
```

#### Output

Clips are saved in `<output>/clips/` with the format: `{index}-{mapname}-{highlightId}.mp4`

Example: `1-de_dust2-ced8b2df3663.mp4`, `2-de_mirage-a1b2c3d4e5f6.mp4`

#### Recording Process

1. Parses `highlights.json` and validates demo files exist
2. For each highlight:
   - Generates a CFG file with HLAE recording commands
   - Launches HLAE with CS:GO and the demo file
   - Records the highlight tick range using `mirv_streams`
   - Encodes TGA image sequence to MP4 using FFmpeg
3. Cleans up temporary files

### `merge`

Merges recorded clips into a single video using FFmpeg.

```bash
node src/index.js merge --clips <path> [--output <path>] [--cleanup]
```

#### Prerequisites

- **FFmpeg**: Must be installed and available in PATH. Download from [https://ffmpeg.org/](https://ffmpeg.org/)

#### Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--clips <path>` | Yes | - | Path to folder containing `.mp4` clip files |
| `--output <path>` | No | `./output/highlights_final.mp4` | Output path for final video |
| `--cleanup` | No | - | Delete individual clips after merging |
| `--transition <duration>` | No | - | Add fade in/out transitions (duration in seconds) |

#### Examples

Merge clips into a single video:

```bash
node src/index.js merge --clips ./output/clips_processed
```

Merge with custom output path:

```bash
node src/index.js merge --clips ./output/clips_processed --output ./my_highlights.mp4
```

Merge and delete individual clips after:

```bash
node src/index.js merge --clips ./output/clips_processed --cleanup
```

Merge with 1-second fade transitions between clips:

```bash
node src/index.js merge --clips ./output/clips_final --transition 1
```

#### Transitions

When using `--transition`, fade effects are applied between highlights:

- **Fade out** at the end of each clip (except the last)
- **Fade in** at the beginning of each clip (except the first)
- Applies to both video and audio
- Requires re-encoding, so it takes longer than simple merging

Example: `--transition 1` adds 1-second fades, creating smooth transitions between highlights.

#### Output

The command produces a single merged video file (default: `./output/highlights_final.mp4`).

### `compress`

Compresses a video file to reduce file size using FFmpeg.

```bash
node src/index.js compress --input <path> [--power <level>] [--output <path>]
```

#### Prerequisites

- **FFmpeg**: Must be installed and available in PATH. Download from [https://ffmpeg.org/](https://ffmpeg.org/)

#### Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--input <path>` | Yes | - | Path to input video file |
| `--power <level>` | No | `5` | Compression power 1-10 (1=light, 10=maximum) |
| `--output <path>` | No | `{input}_compressed.mp4` | Output path for compressed video |

#### Compression Power Scale

| Power | CRF | Quality |
|-------|-----|---------|
| 1 | 18 | Minimal compression, highest quality |
| 5 | 26 | Balanced compression and quality |
| 10 | 36 | Maximum compression, lower quality |

#### Examples

Compress with default settings (power 5):

```bash
node src/index.js compress --input ./output/highlights_final.mp4
```

Compress with maximum compression:

```bash
node src/index.js merge --clips ./output/clips_processed --transition 0.5
```

Compress with custom output path:

```bash
node src/index.js compress --input ./output/highlights_final.mp4 --power 7 --output ./my_compressed_video.mp4
```

#### Output

The command produces a compressed video file and displays the size reduction percentage.

### `player-kills`

Shows all kills by a specific player in a demo file. Useful for debugging and understanding highlight detection.

```bash
node src/index.js player-kills --demo <path> --steamid <id>
```

#### Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--demo <path>` | Yes | - | Path to demo file (`.dem`) |
| `--steamid <id>` | Yes | - | Player Steam ID (64-bit format, e.g., `76561198105978409`) |

#### Example

```bash
node src/index.js player-kills --demo ./demos/auto0-20260116-172808-1914328147-de_dust2-WIX_CSGO_CLUB_1.dem --steamid 76561198105978409
```

#### Output

```
CS:GO Player Kills Analyzer
===========================
Demo: match.dem
Steam ID: 76561198105978409

Player: PlayerName
Tick rate: 128
Total kills: 15

 # | Tick     | Time     | Gap      | Weapon      | Hit      | Victim
---|----------|----------|----------|-------------|----------|--------
 1 |    68903 |     8:58 |        - | awp         | body     | Enemy1
 2 |   105596 |    13:45 |   286.66s | awp         | body     | Enemy2
 3 |   107616 |    14:01 |    15.78s | awp         | HEAD     | Enemy3
...
```

This helps identify:
- Which kills were detected and their timings
- Gap between kills (for understanding kill-series detection)
- Whether kills were headshots or body shots

### `timestamps`

Generates a list of highlight timestamps (after speedup/slowmo effects are applied) with highlight type, map name, and player name. Useful for creating video chapter markers or quick reference.

```bash
node src/index.js timestamps --highlights <path> [--output <path>] [--speedup <multiplier>] [--slowmo <factor>]
```

#### Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--highlights <path>` | Yes | - | Path to `highlights.json` file |
| `--output <path>` | No | `./output/timestamps.txt` | Output file path for timestamps |
| `--speedup <multiplier>` | No | `3` | Speedup multiplier used in postprocess |
| `--slowmo <factor>` | No | `0.6` | Slowmo factor used in postprocess |

#### Example

```bash
node src/index.js timestamps --highlights ./output/highlights.json
```

#### Output Format

```
00:00:00 | 3K | de_mirage | mag-ua
00:00:17 | ACE | de_mirage | PlayerName
00:00:42 | 1v3 | de_dust2 | AnotherPlayer
00:01:03 | one-tap deagle | de_inferno | SomePlayer
...
```

Each line contains:
- **Timestamp** (HH:MM:SS) - cumulative start time in the final merged video
- **Highlight type** - formatted (3K, ACE, 1v3, one-tap deagle, knife, collateral 2K, etc.)
- **Map name** - extracted from demo filename (de_mirage, de_dust2, etc.)
- **Player name** - the player who made the highlight

**Note:** Timestamps account for all video effects:
- **Slowmo** expands time (e.g., 1 second at 0.6x becomes ~1.67 seconds)
- **Speedup** compresses time (e.g., 10 seconds at 3x becomes ~3.33 seconds)

### `top`

Selects the top N highlights by "impressiveness" score. Useful for creating highlight compilations from large datasets.

```bash
node src/index.js top [--highlights <path>] [--count <n>] [--output <path>] [options]
```

#### Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--highlights <path>` | No | `./output/highlights.json` | Path to `highlights.json` file |
| `--count <n>` | No | `10` | Number of top highlights to select |
| `--output <path>` | No | `./output/highlights_top.json` | Output file path |
| `--asc` | No | - | Sort ascending (lowest score first, default: descending) |
| `--show-scores` | No | - | Print detailed score breakdown to console |
| `--player <steamId>` | No | - | Filter by player Steam ID |
| `--type <type>` | No | - | Filter by highlight type (kill-series, clutch, etc.) |
| `--min-kills <n>` | No | - | Minimum kill count |
| `--unique-players <n>` | No | `1` | Max highlights per player (for variety) |

#### Scoring Algorithm

Highlights are ranked by a composite "impressiveness" score:

```
Score = Base + Type + KillCount + Intensity + Style + Weapon + Duration + Slowmo
```

| Factor | Description |
|--------|-------------|
| **Base** | Points from kills (headshots, weapon type) |
| **Type** | kill-series/collateral: +15, one-tap: +12, clutch/knife: +5 |
| **KillCount** | 3K: +5, 4K: +15, ACE: +30, 6K+: +40 |
| **Intensity** | Faster kills = higher bonus (max +20 minus killGapSum) |
| **Style** | +3 per headshot, +5 all headshots, +10 noscope HS |
| **Weapon** | +3 for deagle/scout headshots |
| **Duration** | Shorter clips get bonus (max +10) |
| **Slowmo** | +3 if slowmo effect present |

#### Examples

Get top 10 highlights (uses defaults):

```bash
node src/index.js top
```

Get top 20 with detailed score breakdown:

```bash
node src/index.js top --count 20 --show-scores
```

Sort ascending (lowest scores first):

```bash
node src/index.js top --count 10 --asc
```

Allow multiple highlights per player:

```bash
node src/index.js top --unique-players 3
```

Filter by type:

```bash
node src/index.js top --type kill-series --min-kills 4
```

#### Output Format

The output file uses a simplified format compatible with other commands:

```json
{
  "generatedAt": "2026-01-31T...",
  "sourceFile": "highlights.json",
  "topCount": 10,
  "filters": { "uniquePlayers": 1 },
  "summary": {
    "totalHighlights": 10,
    "totalDurationSeconds": 245.5,
    "byType": { "kill-series": 7, "clutch": 2, "one-tap": 1 }
  },
  "highlights": [
    {
      "rank": 1,
      "_score": { "total": 83.3, "base": 11, "typeBonus": 15, ... },
      "id": "...",
      "type": "kill-series",
      "player": { "name": "...", "steamId": "..." },
      ...
    }
  ]
}
```

You can use the output file directly with other commands (`record`, `postprocess-*`, `timestamps`).

## Typical Workflow

1. **Analyze** demos to detect highlights:
   ```bash
   node src/index.js analyze --demos ./demos
   ```

2. **Record** highlights using HLAE:
   ```bash
   node src/index.js record --highlights ./output/highlights.json --demos ./demos --hlae "C:\Program Files (x86)\HLAE\hlae.exe" --csgo "C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive"
   ```

3. **Merge** clips into final video:
   ```bash
   node src/index.js merge --clips ./output/clips
   ```

4. **(Optional) Compress** the final video to reduce file size:
   ```bash
   node src/index.js compress --input ./output/highlights_final.mp4 --power 5
   ```

## Highlight Types

The tool detects six types of highlights, each with a priority level (used for collision resolution):

### 1. Solo Kill (Priority: 1)

Manually added single kill highlights via `--solo-kills-file`. Lowest priority - will be removed if colliding with other highlights.

### 2. One-Tap (Priority: 1.5)

A single headshot kill with exactly one bullet fired within the time window (2s before, 1s after the kill).

**Qualification criteria:**
- Must be a headshot
- Only one shot fired in the detection window
- Excludes shotguns, SMGs, machine guns
- Excludes AWP and auto-snipers (G3SG1, SCAR-20) - one-shot kills are expected
- SSG08 (Scout) headshots qualify as one-taps

**Note:** Kills that are part of a kill-series are excluded from one-tap detection.

### 3. Clutch (Priority: 2)

A 1vX situation where the solo player's team wins the round.

**Qualification criteria:**
- Minimum 2 enemies (1v2 or higher)
- The clutching player must get at least 1 kill
- The clutching player's team must win the round
- Includes posthumous wins (e.g., T plants bomb, dies, bomb explodes)

### 4. Knife Kill (Priority: 3)

Any kill with a knife weapon. Includes all knife skins (bayonet, karambit, butterfly, etc.).

**Note:** If a knife kill is part of a qualifying kill series, only the series is recorded (no duplicate knife highlight).

### 5. Collateral (Priority: 4)

Two or more enemies killed with a single shot (same tick).

### 6. Kill Series (Priority: 5)

A sequence of kills by the same player within a time window.

**Qualification criteria** (any of the following):
- 3 or more kills within 15 seconds of each other
- 2 or more kills where at least one is a knife kill
- 2 or more consecutive headshots with special weapons (AWP, SSG08, G3SG1, SCAR-20, Nova, XM1014, MAG-7, Sawed-Off, Desert Eagle, R8 Revolver)

**Restrictions:**
- Series cannot span round boundaries
- Team kills and suicides are ignored

## Collision Resolution

When multiple highlights overlap in time for the same player, the tool keeps the higher priority highlight:

1. **Priority comparison**: Higher priority wins (kill-series > collateral > knife > clutch > one-tap > solo)
2. **Kill count comparison**: For kill-series vs kill-series, more kills wins
3. **Points comparison**: If priority and kill count are equal, higher points wins

**Different players' highlights at the same time are all kept.**

## Output Format

The tool generates `highlights.json` with the following structure:

```json
{
  "generatedAt": "2026-01-20T10:00:00.000Z",
  "config": {
    "detection": {
      "maxDelay": 15,
      "minSeriesKills": 3,
      "minEnemies": 2
    },
    "killPoints": { ... },
    "priorities": { ... }
  },
  "demos": [
    {
      "file": "demo.dem",
      "tickRate": 128,
      "highlights": [
        {
          "id": "ced8b2df3663",
          "type": "kill-series",
          "priority": 2,
          "player": {
            "name": "PlayerName",
            "steamId": "76561198..."
          },
          "startTick": 10000,
          "endTick": 12000,
          "killCount": 3,
          "points": 15,
          "kills": [
            { "tick": 10000, "weapon": "ak47", "headshot": true, "noscope": false },
            { "tick": 11000, "weapon": "ak47", "headshot": false, "noscope": false },
            { "tick": 12000, "weapon": "deagle", "headshot": true, "noscope": false }
          ],
          "containsKnife": false,
          "allHeadshotsWithSpecialWeapon": false,
          "demoFile": "demo.dem",
          "durationSeconds": 15.63,
          "playback": {
            "startTick": 9744,
            "endTick": 12128,
            "durationSeconds": 18.63,
            "paddingBefore": 3,
            "paddingAfter": 3
          }
        },
        {
          "id": "b8c4f695d6d9",
          "type": "clutch",
          "priority": 5,
          "player": { "name": "PlayerName", "steamId": "..." },
          "round": 6,
          "situation": "1v3",
          "startTick": 50000,
          "endTick": 55000,
          "points": 30,
          "killTicks": [51000, 53000, 54500],
          "demoFile": "demo.dem",
          "durationSeconds": 39.06,
          "playback": {
            "startTick": 49616,
            "endTick": 55384,
            "durationSeconds": 45.06,
            "paddingBefore": 3,
            "paddingAfter": 3,
            "speedupSegments": [
              {
                "startTick": 51256,
                "endTick": 52744,
                "durationTicks": 1488,
                "durationSeconds": 11.63
              }
            ]
          }
        }
      ]
    }
  ],
  "summary": {
    "totalHighlights": 15,
    "totalDurationSeconds": 180.5,
    "byType": {
      "kill-series": 8,
      "collateral": 1,
      "knife": 3,
      "clutch": 3
    }
  }
}
```

### Highlight Fields

Each highlight includes:

| Field | Description |
|-------|-------------|
| `id` | Unique 12-character hash identifier |
| `type` | Highlight type (kill-series, knife, collateral, clutch) |
| `killTicks` | (Clutches only) Array of tick numbers when the clutch player got kills |

### Playback Information

Each highlight includes a `playback` object with recommended tick ranges for video extraction:

| Field | Description |
|-------|-------------|
| `startTick` | Start tick with padding (3 seconds before highlight) |
| `endTick` | End tick with padding (3 seconds after highlight, capped at round end) |
| `durationSeconds` | Total playback duration including padding |
| `paddingBefore` | Seconds of padding before the highlight |
| `paddingAfter` | Seconds of padding after the highlight |
| `speedupSegments` | (Clutches & kill series) Array of segments to speed up (gaps between kills) |

## Configuration

Default configuration (hardcoded in `src/index.js`):

```javascript
{
  padding: {
    before: 3,           // Seconds before highlight starts
    after: 3             // Seconds after highlight ends
  },
  speedup: {
    startDelay: 2,         // Seconds after highlight start before speedup can begin
    bufferAroundKills: 2,  // Seconds at normal speed before/after each kill
    minGapDuration: 4      // Minimum gap duration to trigger speedup
  },
  music: {
    folder: './music',     // Path to folder with music tracks
    volume: 0.7,           // Music volume (0-1)
    gameVolume: 1.0,       // Game audio volume (0-1)
    fadeDuration: 2,       // Fade in/out duration in seconds (50% → 100% → 50%)
    enabled: true          // Enable music overlay by default
  },
  detection: {
    maxDelay: 15,        // Max seconds between kills for a series
    minSeriesKills: 3,   // Min kills for regular series (2 with knife always qualifies)
    minEnemies: 2        // Min enemies for clutch (1vX where X >= 2)
  },
  killPoints: {
    pistol_body: 1,
    rifle_body: 2,
    sniper_body: 3,
    pistol_headshot: 4,
    rifle_headshot: 5,
    sniper_headshot: 6,
    sniper_noscope: 7,
    knife: 8
  },
  priorities: {
    'solo': 1,
    'one-tap': 1.5,
    'clutch': 2,
    'knife': 3,
    'collateral': 4,
    'kill-series': 5
  }
}
```

## Dependencies

- [demofile](https://www.npmjs.com/package/demofile) - CS:GO demo parser
- [commander](https://www.npmjs.com/package/commander) - CLI framework

## License

MIT
