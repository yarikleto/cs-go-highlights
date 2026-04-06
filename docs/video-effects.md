# Video Effects

## Speedup

When using speedup, long gaps between action are sped up using FFmpeg post-processing:

- Works for both **clutches** and **kill series** (multi kills)
- Keeps 2 seconds of normal speed before/after each action
- Only speeds up gaps longer than 4 seconds
- Applies to both video and audio (audio uses atempo filter)
- Works with any speed multiplier (e.g., 2x, 4x, 8x)

**Smart action detection:**
- Detects **all player shots** (not just kills) -- speedup won't activate while shooting
- Includes **knife kills** as action points (melee attacks don't have weapon_fire events)
- Groups consecutive shots into "action periods" for smooth transitions

## Slow Motion

An "impact" slow motion effect applied during postprocessing:

**For kill-series and clutches:**
- Finds the **last headshot or noscope kill** in the series (not necessarily the final kill)
- Example: `[body, headshot, body]` -> slowmo on the headshot (middle kill)

**For collaterals:**
- **Always** applies slowmo (collaterals are always impressive)

**Qualifying kills:**
- A **headshot**, OR
- A **noscope** sniper shot

**Effect style:**
- **Instant slowdown** at the kill moment (dramatic impact)
- **Gradual ramp-up** back to normal speed over 0.6 seconds
- Creates a cinematic "bullet time" effect

## Player Overlay

When overlay is enabled, a player info overlay is displayed in the bottom-left corner:

- **Player name** (large white text)
- **Highlight type** (smaller yellow text: "1V4 CLUTCH", "ACE", "4K", "KNIFE KILL", etc.)
- **Rank prefix** (if processing ranked highlights from `top` command: "TOP 15: ACE")
- Fade in (0.5s), display (2.5s), fade out (0.5s)
- Semi-transparent dark background for readability

## Transitions

When using `--transition` with the `merge` command, fade effects are applied between highlights:

- **Fade out** at the end of each clip (except the last)
- **Fade in** at the beginning of each clip (except the first)
- Applies to both video and audio
- Requires re-encoding, so it takes longer than simple merging

## Recording Settings

Default recording settings (high quality, hardcoded):
- Resolution: 1920x1080 (Full HD)
- Framerate: 60 FPS
- Codec: H.264 (libx264)
- Quality: CRF 15 (very high quality)
- Preset: slow (better compression)
- Audio: AAC 320kbps

## Automatic CS:GO Setup

The record command automatically configures CS:GO for optimal recording. **Your normal game settings are NOT modified** -- these are applied via a temporary CFG file.

| Category | Settings |
|----------|----------|
| **HUD** | Minimal (only death notices visible, killfeed filtered to highlight player) |
| **Viewmodel** | Visible |
| **Crosshair** | Classic green static crosshair |
| **Camera** | Locked to highlight player |
| **X-Ray** | Disabled |
| **Overlays** | Disabled (net_graph, showfps) |
| **Music** | Muted |
| **Voice** | Muted by default (use `--hud` or `--voice` to enable) |
| **Graphics** | High quality (HDR, postprocessing enabled) |
| **Tracers** | Enabled |
