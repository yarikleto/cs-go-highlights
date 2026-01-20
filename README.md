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
node src/index.js analyze --demos <path> [--output <path>]
```

#### Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--demos <path>` | Yes | - | Path to folder containing `.dem` files |
| `--output <path>` | No | `./output` | Output folder for `highlights.json` |

#### Example

```bash
node src/index.js analyze --demos ./my-demos --output ./results
```

### `record`

Records all highlights using HLAE (Half-Life Advanced Effects). Produces individual video clips for each highlight.

```bash
node src/index.js record --highlights <path> --demos <path> --hlae <path> --csgo <path> [options]
```

**Quick example** (copy and edit paths):

```bash
node src/index.js record --highlights ./output/highlights.json --demos ./demos --hlae "C:\Program Files (x86)\HLAE\HLAE.exe" --csgo "C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive"
```

#### Prerequisites

- **HLAE**: Download from [https://www.advancedfx.org/](https://www.advancedfx.org/)
- **FFmpeg**: Must be installed and available in PATH. Download from [https://ffmpeg.org/](https://ffmpeg.org/)
- **CS:GO Legacy**: You must have the **Legacy Version of CS:GO** installed (not CS2). To install it:
  1. In Steam, right-click Counter-Strike 2 → Properties → Betas
  2. Select "csgo_legacy - Legacy Version of CS:GO"
  3. Or when launching, choose "Play Legacy Version of CS:GO"
  
  The legacy version is typically installed at:
  `C:\Steam\steamapps\common\Counter-Strike Global Offensive`
  
  **Note**: HLAE does not support Counter-Strike 2. Only the legacy CS:GO version is compatible.

#### Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--highlights <path>` | Yes | - | Path to `highlights.json` file |
| `--demos <path>` | Yes | - | Path to folder containing `.dem` files |
| `--hlae <path>` | Yes | - | Path to HLAE executable (`hlae.exe`) |
| `--csgo <path>` | Yes | - | Path to CS:GO installation folder |
| `--output <path>` | No | `./output` | Output folder for clips |
| `--player <steamId>` | No | - | Filter highlights by player Steam ID |

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
| **HUD** | Hidden (cl_drawhud 0, cl_draw_only_deathnotices 1) |
| **Viewmodel** | Hidden (r_drawviewmodel 0) |
| **X-Ray** | Disabled (spec_show_xray 0) |
| **Overlays** | Disabled (net_graph 0, cl_showfps 0) |
| **Music** | Muted (all music volumes set to 0) |
| **Graphics** | High quality (HDR, postprocessing enabled) |
| **Tracers** | Enabled (r_drawtracers_firstperson 1) |

After recording completes, CS:GO closes and your original settings remain unchanged in your config files.

#### Examples

Record all highlights:

```bash
node src/index.js record --highlights ./output/highlights.json --demos ./demos --hlae "C:\HLAE\hlae.exe" --csgo "C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive"
```

**Important**: The `--csgo` path must point to the Legacy CS:GO installation folder containing `csgo.exe`, not CS2.

Record only highlights from a specific player:

```bash
node src/index.js record --highlights ./output/highlights.json --demos ./demos --hlae "C:\HLAE\hlae.exe" --csgo "C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive" --player 76561198012345678
```

#### Output

The command produces individual clips in `<output>/clips/` folder (e.g., `clip_0001.mp4`, `clip_0002.mp4`).

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

#### Examples

Merge clips into a single video:

```bash
node src/index.js merge --clips ./output/clips
```

Merge with custom output path:

```bash
node src/index.js merge --clips ./output/clips --output ./my_highlights.mp4
```

Merge and delete individual clips after:

```bash
node src/index.js merge --clips ./output/clips --cleanup
```

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
node src/index.js compress --input ./output/highlights_final.mp4 --power 10
```

Compress with custom output path:

```bash
node src/index.js compress --input ./output/highlights_final.mp4 --power 7 --output ./my_compressed_video.mp4
```

#### Output

The command produces a compressed video file and displays the size reduction percentage.

## Typical Workflow

1. **Analyze** demos to detect highlights:
   ```bash
   node src/index.js analyze --demos ./demos
   ```

2. **Record** highlights using HLAE:
   ```bash
   node src/index.js record --highlights ./output/highlights.json --demos ./demos --hlae "C:\HLAE\hlae.exe" --csgo "C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive"
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

The tool detects four types of highlights, each with a priority level (used for collision resolution):

### 1. Kill Series (Priority: 2)

A sequence of kills by the same player within a time window.

**Qualification criteria** (any of the following):
- 3 or more kills within 15 seconds of each other
- 2 or more kills where at least one is a knife kill
- 2 or more consecutive headshots with special weapons (AWP, SSG08, G3SG1, SCAR-20, Nova, XM1014, MAG-7, Sawed-Off, Desert Eagle, R8 Revolver)

**Restrictions:**
- Series cannot span round boundaries
- Team kills and suicides are ignored

### 2. Knife Kill (Priority: 3)

Any kill with a knife weapon. Includes all knife skins (bayonet, karambit, butterfly, etc.).

**Note:** If a knife kill is part of a qualifying kill series, only the series is recorded (no duplicate knife highlight).

### 3. Collateral (Priority: 4)

Two or more enemies killed with a single shot (same tick).

### 4. Clutch (Priority: 5)

A 1vX situation where the solo player's team wins the round.

**Qualification criteria:**
- Minimum 2 enemies (1v2 or higher)
- The clutching player's team must win the round
- Includes posthumous wins (e.g., T plants bomb, dies, bomb explodes)

## Collision Resolution

When multiple highlights overlap in time for the same player, the tool keeps the higher priority highlight:

1. **Priority comparison**: Higher priority wins (clutch > collateral > knife > kill-series)
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
            "paddingBefore": 2,
            "paddingAfter": 1
          }
        },
        {
          "type": "clutch",
          "priority": 5,
          "player": { "name": "PlayerName", "steamId": "..." },
          "round": 6,
          "situation": "1v3",
          "startTick": 50000,
          "endTick": 55000,
          "points": 30,
          "demoFile": "demo.dem",
          "durationSeconds": 39.06,
          "playback": { ... }
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

### Playback Information

Each highlight includes a `playback` object with recommended tick ranges for video extraction:

| Field | Description |
|-------|-------------|
| `startTick` | Start tick with padding (2 seconds before highlight) |
| `endTick` | End tick with padding (1 second after highlight) |
| `durationSeconds` | Total playback duration including padding |
| `paddingBefore` | Seconds of padding before the highlight |
| `paddingAfter` | Seconds of padding after the highlight |

## Configuration

Default configuration (hardcoded in `src/index.js`):

```javascript
{
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
    'kill-series': 2,
    'knife': 3,
    'collateral': 4,
    'clutch': 5
  }
}
```

## Dependencies

- [demofile](https://www.npmjs.com/package/demofile) - CS:GO demo parser
- [commander](https://www.npmjs.com/package/commander) - CLI framework

## License

MIT
