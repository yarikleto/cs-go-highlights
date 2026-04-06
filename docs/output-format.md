# Output Format

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
    "killPoints": { "..." : "..." },
    "priorities": { "..." : "..." }
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

## Highlight Fields

| Field | Description |
|-------|-------------|
| `id` | Unique 12-character hash identifier |
| `type` | Highlight type (kill-series, knife, collateral, clutch, one-tap, solo) |
| `priority` | Priority level for collision resolution |
| `player` | Player name and Steam ID |
| `startTick` / `endTick` | Tick range of the highlight |
| `killCount` | Number of kills |
| `points` | Computed point value |
| `kills` | Array of individual kill details |
| `killTicks` | (Clutches only) Array of tick numbers when the clutch player got kills |

## Playback Information

Each highlight includes a `playback` object with recommended tick ranges for video extraction:

| Field | Description |
|-------|-------------|
| `startTick` | Start tick with padding (3 seconds before highlight) |
| `endTick` | End tick with padding (3 seconds after highlight, capped at round end) |
| `durationSeconds` | Total playback duration including padding |
| `paddingBefore` | Seconds of padding before the highlight |
| `paddingAfter` | Seconds of padding after the highlight |
| `speedupSegments` | (Clutches & kill series) Array of segments to speed up (gaps between kills) |

## Configuration Defaults

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
    folder: './music',
    volume: 0.7,
    gameVolume: 1.0,
    fadeDuration: 2,
    enabled: true
  },
  detection: {
    maxDelay: 15,        // Max seconds between kills for a series
    minSeriesKills: 3,   // Min kills for regular series
    minEnemies: 2        // Min enemies for clutch (1vX where X >= 2)
  }
}
```
