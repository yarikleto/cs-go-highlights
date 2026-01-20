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
