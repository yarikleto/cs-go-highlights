# Scoring

Highlights are ranked by a composite "impressiveness" score used by the `top` command.

## Score Formula

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

## Kill Points

| Kill Type | Points |
|-----------|--------|
| Pistol body | 1 |
| Rifle body | 2 |
| Sniper body | 3 |
| Pistol headshot | 4 |
| Rifle headshot | 5 |
| Sniper headshot | 6 |
| Sniper noscope | 7 |
| Knife | 8 |

## Output Format

The `top` command outputs a JSON file compatible with other commands:

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
      "_score": { "total": 83.3, "base": 11, "typeBonus": 15, "..." : "..." },
      "id": "...",
      "type": "kill-series",
      "player": { "name": "...", "steamId": "..." }
    }
  ]
}
```
