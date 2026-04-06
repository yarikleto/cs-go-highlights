# Music

Add background music to your highlight clips.

## Setup

1. Create a `music/` folder in your project directory
2. Add audio files (MP3, WAV, FLAC, OGG, M4A, AAC)

## How It Works

- The `analyze` command generates `music-mapping.json` alongside `highlights.json`
- Each clip is assigned a unique segment of music (no reuse between clips)
- Music plays sequentially through all clips
- When a track ends, the next track in the folder is used
- Music fades in/out at clip boundaries (50% -> 100% -> 50%)

**Music behavior with effects:**
- **Speedup**: Music plays at normal speed (not sped up)
- **Slowmo**: Music plays at normal speed

## music-mapping.json

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

## Manual Music Offset

You can manually adjust music timing for individual clips by editing the `offset` field in `music-mapping.json`:

- `"offset": "1:30"` -- shift music 1 minute 30 seconds forward (skip intro)
- `"offset": "-0:30"` -- shift music 30 seconds backward (not recommended, use positive offsets)

After editing offsets, run `resync-music` to recalculate times.

## Override Start Time

Use `overrideStartTime` to completely override the calculated `startTime` for a specific clip:

- `"overrideStartTime": "5:30"` -- use music starting at 5:30 regardless of calculated position
- Does NOT affect `startTime`/`endTime` calculations for other clips
- Takes priority over `startTime` when present during postprocess
- Preserved when running `analyze` (unless `--reset-music` is used)

## Music Fine-tuning Workflow

1. Run `postprocess-ui` with visual effects (slowmo, speedup, overlay) -> `clips_processed/`
2. Run `postprocess-sound` to add music -> `clips_final/`
3. Edit `music-mapping.json` (adjust `offset` or `overrideStartTime`)
4. Run `resync-music` if you changed `offset` values
5. Run `postprocess-sound --force` to re-apply music with new settings
6. Repeat steps 3-5 until satisfied
