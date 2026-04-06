# Highlight Types

The tool detects six types of highlights, each with a priority level used for collision resolution.

## Kill Series (Priority: 5)

A sequence of kills by the same player within a time window.

**Qualification criteria** (any of the following):
- 3 or more kills within 15 seconds of each other
- 2 or more kills where at least one is a knife kill
- 2 or more consecutive headshots with special weapons (AWP, SSG08, G3SG1, SCAR-20, Nova, XM1014, MAG-7, Sawed-Off, Desert Eagle, R8 Revolver)

**Restrictions:**
- Series cannot span round boundaries
- Team kills and suicides are ignored

## Collateral (Priority: 4)

Two or more enemies killed with a single shot (same tick).

## Knife Kill (Priority: 3)

Any kill with a knife weapon. Includes all knife skins (bayonet, karambit, butterfly, etc.).

If a knife kill is part of a qualifying kill series, only the series is recorded (no duplicate knife highlight).

## Clutch (Priority: 2)

A 1vX situation where the solo player's team wins the round.

**Qualification criteria:**
- Minimum 2 enemies (1v2 or higher)
- The clutching player must get at least 1 kill
- The clutching player's team must win the round
- Includes posthumous wins (e.g., T plants bomb, dies, bomb explodes)

## One-Tap (Priority: 1.5)

A "cold" one-tap -- patient, precise first-shot headshot where the player waited for the perfect moment.

**Qualification criteria:**
- No shots from round start until the kill (player was waiting)
- First bullet is a headshot
- No shots for 2 seconds after the kill

**Allowed weapons:** Pistols, Rifles, Machine guns

**Excluded weapons:** All snipers (AWP, Scout, auto-snipers), Shotguns, SMGs, Knives

Kills that are part of a kill-series are excluded from one-tap detection.

## Solo Kill (Priority: 1)

Manually added single kill highlights via `--solo-kills-file`. Lowest priority -- will be removed if colliding with other highlights.

## Collision Resolution

When multiple highlights overlap in time for the same player:

1. **Priority comparison**: Higher priority wins (kill-series > collateral > knife > clutch > one-tap > solo)
2. **Kill count comparison**: For kill-series vs kill-series, more kills wins
3. **Points comparison**: If priority and kill count are equal, higher points wins

Different players' highlights at the same time are all kept.
