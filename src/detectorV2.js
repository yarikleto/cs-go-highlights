/**
 * @fileoverview Highlight detection module V2 - Without points calculation
 * 
 * This is a simplified version of the detector that:
 * - Does NOT calculate points (raw data only)
 * - Stores only metadata needed for ranking later
 * - Outputs cleaner highlight objects
 * 
 * Points/scoring logic is moved to the ranking command (top.js)
 */

import { DETECTION, PRIORITIES, HIGHLIGHT_TYPES } from './config.js';
import { groupBy, getPlayerId } from './detector/utils.js';

// =============================================================================
// FACTORY FUNCTIONS (without points)
// =============================================================================

/**
 * Create a base highlight object (no points)
 */
function createBaseHighlight(type, player, priorities = PRIORITIES) {
  return {
    type,
    priority: priorities[type] ?? PRIORITIES[type],
    player: {
      name: player.name,
      steamId: player.steamId,
    },
  };
}

/**
 * Create a kill-series highlight (no points)
 */
function createKillSeriesHighlight({
  player,
  startTick,
  endTick,
  killCount,
  kills,
  containsKnife,
  containsTaser,
  allHeadshotsWithSpecialWeapon,
  priorities,
}) {
  return {
    ...createBaseHighlight(HIGHLIGHT_TYPES.KILL_SERIES, player, priorities),
    startTick,
    endTick,
    killCount,
    kills,
    containsKnife,
    containsTaser,
    allHeadshotsWithSpecialWeapon,
  };
}

/**
 * Create a collateral highlight (no points)
 */
function createCollateralHighlight({
  player,
  tick,
  killCount,
  kills,
  priorities,
}) {
  return {
    ...createBaseHighlight(HIGHLIGHT_TYPES.COLLATERAL, player, priorities),
    tick,
    killCount,
    kills,
  };
}

/**
 * Create a knife kill highlight (no points)
 */
function createKnifeHighlight({
  player,
  tick,
  weapon,
  kill,
  priorities,
}) {
  return {
    ...createBaseHighlight(HIGHLIGHT_TYPES.KNIFE, player, priorities),
    tick,
    weapon,
    kill,  // Full kill data for ranking
  };
}

/**
 * Create a one tap highlight (no points)
 */
function createOneTapHighlight({
  player,
  tick,
  weapon,
  weaponCategory,
  kill,
  priorities,
}) {
  return {
    ...createBaseHighlight(HIGHLIGHT_TYPES.ONE_TAP, player, priorities),
    tick,
    weapon,
    weaponCategory,
    kill,  // Full kill data for ranking
  };
}

/**
 * Create a clutch highlight (no points)
 */
function createClutchHighlight({
  player,
  round,
  situation,
  enemies,
  startTick,
  endTick,
  kills,
  priorities,
}) {
  return {
    ...createBaseHighlight(HIGHLIGHT_TYPES.CLUTCH, player, priorities),
    round,
    situation,
    enemies,  // Number of enemies for ranking
    startTick,
    endTick,
    kills,
  };
}

// =============================================================================
// KILL SERIES DETECTION
// =============================================================================

/**
 * Detect kill series (multi-kills within time window)
 */
function detectKillSeries(kills, maxDelayTicks, minKills, priorities) {
  const highlights = [];
  
  // Group kills by attacker
  const killsByAttacker = groupBy(kills, k => getPlayerId(k.attacker));
  
  for (const [attackerId, attackerKills] of killsByAttacker) {
    // Sort by tick
    const sorted = [...attackerKills].sort((a, b) => a.tick - b.tick);
    
    let seriesStart = 0;
    
    for (let i = 1; i <= sorted.length; i++) {
      const isSeriesEnd = i === sorted.length || 
        (sorted[i].tick - sorted[i - 1].tick > maxDelayTicks);
      
      if (isSeriesEnd) {
        const seriesKills = sorted.slice(seriesStart, i);
        
        if (seriesKills.length >= minKills) {
          const firstKill = seriesKills[0];
          const lastKill = seriesKills[seriesKills.length - 1];
          
          // Extract kill data (with all metadata)
          const killsData = seriesKills.map(k => ({
            tick: k.tick,
            weapon: k.weapon,
            headshot: k.headshot,
            noscope: k.noscope || false,
            penetrated: k.penetrated || 0,
            thrusmoke: k.thrusmoke || false,
            attackerblind: k.attackerblind || false,
            distance: k.distance || 0,
            firstShotTick: k.firstShotTick,
            flickAngle: k.flickAngle || 0,
            isFlick: k.isFlick || false,
            airborne: k.airborne || false,
            attackerEquipmentValue: k.attackerEquipmentValue || 0,
            victimEquipmentValue: k.victimEquipmentValue || 0,
          }));
          
          const containsKnife = seriesKills.some(k => k.isKnife);
          const containsTaser = seriesKills.some(k => k.isTaser);
          const allHeadshotsWithSpecialWeapon = seriesKills.every(
            k => k.headshot && k.isHeadshotSeriesWeapon
          );
          
          highlights.push(createKillSeriesHighlight({
            player: firstKill.attacker,
            startTick: firstKill.tick,
            endTick: lastKill.tick,
            killCount: seriesKills.length,
            kills: killsData,
            containsKnife,
            containsTaser,
            allHeadshotsWithSpecialWeapon,
            priorities,
          }));
        }
        
        seriesStart = i;
      }
    }
  }
  
  return highlights;
}

/**
 * Get set of kill keys that are part of series (for exclusion)
 */
function getKillTicksInSeries(seriesHighlights) {
  const ticks = new Set();
  for (const series of seriesHighlights) {
    for (const kill of series.kills) {
      ticks.add(`${series.player.steamId}_${kill.tick}`);
    }
  }
  return ticks;
}

/**
 * Get knife kills that are part of series
 */
function getKnifeKillsInSeries(kills, seriesHighlights) {
  const knifeKillsInSeries = new Set();
  
  for (const series of seriesHighlights) {
    const playerKey = series.player.steamId || series.player.name;
    for (const kill of series.kills) {
      // Check if this kill in series was a knife kill
      const originalKill = kills.find(k => 
        (k.attacker.steamId === series.player.steamId || k.attacker.name === series.player.name) &&
        k.tick === kill.tick &&
        k.isKnife
      );
      if (originalKill) {
        knifeKillsInSeries.add(`${playerKey}_${kill.tick}`);
      }
    }
  }
  
  return knifeKillsInSeries;
}

// =============================================================================
// COLLATERAL DETECTION
// =============================================================================

/**
 * Detect collaterals (multiple kills on same tick)
 */
function detectCollaterals(kills, priorities) {
  const highlights = [];
  
  // Group by attacker + tick
  const byAttackerTick = groupBy(kills, k => `${getPlayerId(k.attacker)}_${k.tick}`);
  
  for (const [key, tickKills] of byAttackerTick) {
    if (tickKills.length >= 2) {
      const firstKill = tickKills[0];
      
      const killsData = tickKills.map(k => ({
        tick: k.tick,
        weapon: k.weapon,
        headshot: k.headshot,
        noscope: k.noscope || false,
        penetrated: k.penetrated || 0,
        thrusmoke: k.thrusmoke || false,
        attackerblind: k.attackerblind || false,
        distance: k.distance || 0,
        flickAngle: k.flickAngle || 0,
        isFlick: k.isFlick || false,
        airborne: k.airborne || false,
        attackerEquipmentValue: k.attackerEquipmentValue || 0,
        victimEquipmentValue: k.victimEquipmentValue || 0,
      }));
      
      highlights.push(createCollateralHighlight({
        player: firstKill.attacker,
        tick: firstKill.tick,
        killCount: tickKills.length,
        kills: killsData,
        priorities,
      }));
    }
  }
  
  return highlights;
}

// =============================================================================
// KNIFE KILL DETECTION
// =============================================================================

/**
 * Detect knife kills (excluding those in series)
 */
function detectKnifeKills(kills, priorities, knifeKillsInSeries) {
  const highlights = [];
  
  for (const kill of kills) {
    if (!kill.isKnife) continue;
    
    const key = `${getPlayerId(kill.attacker)}_${kill.tick}`;
    if (knifeKillsInSeries.has(key)) continue;
    
    highlights.push(createKnifeHighlight({
      player: kill.attacker,
      tick: kill.tick,
      weapon: kill.weapon,
      kill: {
        tick: kill.tick,
        weapon: kill.weapon,
        headshot: kill.headshot,
        distance: kill.distance || 0,
        flickAngle: kill.flickAngle || 0,
        isFlick: kill.isFlick || false,
        airborne: kill.airborne || false,
        attackerEquipmentValue: kill.attackerEquipmentValue || 0,
        victimEquipmentValue: kill.victimEquipmentValue || 0,
      },
      priorities,
    }));
  }
  
  return highlights;
}

// =============================================================================
// ONE TAP DETECTION
// =============================================================================

/**
 * Detect one taps (single precise headshot, first shot of engagement)
 */
function detectOneTaps(kills, shotsByPlayer, rounds, tickRate, priorities, detection, killTicksInSeries) {
  const highlights = [];
  const windowAfterTicks = (detection.oneTap?.windowAfter || 2) * tickRate;
  
  for (const kill of kills) {
    // Must be headshot
    if (!kill.headshot) continue;
    
    // Skip if in series
    const key = `${getPlayerId(kill.attacker)}_${kill.tick}`;
    if (killTicksInSeries.has(key)) continue;
    
    // Skip knife/taser
    if (kill.isKnife || kill.isTaser) continue;
    
    const steamId = kill.attacker.steamId;
    if (!steamId || !shotsByPlayer[steamId]) continue;
    
    const shots = shotsByPlayer[steamId];
    
    // Find round start for this kill
    const round = rounds.find(r => r.number === kill.round);
    if (!round) continue;
    
    const roundStartTick = round.startTick;
    
    // Check: no shots from round start until this kill (first shot = kill)
    const shotsBeforeKill = shots.filter(t => t >= roundStartTick && t < kill.tick);
    if (shotsBeforeKill.length > 1) continue;  // Allow 1 shot (the killing shot)
    
    // Check: no shots after kill within window
    const shotsAfterKill = shots.filter(t => t > kill.tick && t <= kill.tick + windowAfterTicks);
    if (shotsAfterKill.length > 0) continue;
    
    highlights.push(createOneTapHighlight({
      player: kill.attacker,
      tick: kill.tick,
      weapon: kill.weapon,
      weaponCategory: kill.weaponCategory,
      kill: {
        tick: kill.tick,
        weapon: kill.weapon,
        headshot: true,
        noscope: kill.noscope || false,
        penetrated: kill.penetrated || 0,
        thrusmoke: kill.thrusmoke || false,
        attackerblind: kill.attackerblind || false,
        distance: kill.distance || 0,
        flickAngle: kill.flickAngle || 0,
        isFlick: kill.isFlick || false,
        airborne: kill.airborne || false,
        attackerEquipmentValue: kill.attackerEquipmentValue || 0,
        victimEquipmentValue: kill.victimEquipmentValue || 0,
      },
      priorities,
    }));
  }
  
  return highlights;
}

// =============================================================================
// CLUTCH DETECTION
// =============================================================================

/**
 * Detect clutches (1vX situations won)
 */
function detectClutches(rounds, minEnemies, priorities) {
  const highlights = [];
  
  for (const round of rounds) {
    if (!round.clutchSituation) continue;
    
    const clutch = round.clutchSituation;
    
    // Must have minimum enemies
    if (clutch.enemies < minEnemies) continue;
    
    // Must have won the round
    if (round.winner !== clutch.team) continue;
    
    // Extract kill data with all metadata
    const killsData = (clutch.kills || []).map(k => ({
      tick: k.tick,
      weapon: k.weapon,
      headshot: k.headshot,
      noscope: k.noscope || false,
      penetrated: k.penetrated || 0,
      thrusmoke: k.thrusmoke || false,
      attackerblind: k.attackerblind || false,
      distance: k.distance || 0,
      firstShotTick: k.firstShotTick,
      flickAngle: k.flickAngle || 0,
      isFlick: k.isFlick || false,
      airborne: k.airborne || false,
      attackerEquipmentValue: k.attackerEquipmentValue || 0,
      victimEquipmentValue: k.victimEquipmentValue || 0,
    }));
    
    highlights.push(createClutchHighlight({
      player: clutch.player,
      round: round.number,
      situation: `1v${clutch.enemies}`,
      enemies: clutch.enemies,
      startTick: clutch.startTick,
      endTick: round.endTick,
      kills: killsData,
      priorities,
    }));
  }
  
  return highlights;
}

// =============================================================================
// MAIN DETECTION FUNCTION
// =============================================================================

/**
 * Detect all highlights from parsed demo data (V2 - no points)
 * 
 * @param {Object} demoData - Parsed demo data from parser module
 * @param {Object} config - Detection configuration
 * @returns {Array} Array of highlight objects (without points)
 */
function detectHighlightsV2(demoData, config) {
  const { tickRate, kills, rounds, shotsByPlayer } = demoData;
  
  // Extract config
  const detection = config.detection || config;
  const priorities = config.priorities || PRIORITIES;
  
  // Convert time-based config to tick-based
  const maxDelayTicks = detection.maxDelay * tickRate;
  
  const highlights = [];
  
  // Step 1: Detect kill series first
  const killSeriesHighlights = detectKillSeries(
    kills,
    maxDelayTicks,
    detection.minSeriesKills,
    priorities
  );
  highlights.push(...killSeriesHighlights);
  
  // Step 2: Get exclusion sets
  const knifeKillsInSeries = getKnifeKillsInSeries(kills, killSeriesHighlights);
  const killTicksInSeries = getKillTicksInSeries(killSeriesHighlights);
  
  // Step 3: Detect collaterals
  const collateralHighlights = detectCollaterals(kills, priorities);
  highlights.push(...collateralHighlights);
  
  // Step 4: Detect knife kills
  const knifeHighlights = detectKnifeKills(kills, priorities, knifeKillsInSeries);
  highlights.push(...knifeHighlights);
  
  // Step 5: Detect one taps
  if (shotsByPlayer) {
    const oneTapHighlights = detectOneTaps(
      kills,
      shotsByPlayer,
      rounds,
      tickRate,
      priorities,
      { ...DETECTION, ...detection },
      killTicksInSeries
    );
    highlights.push(...oneTapHighlights);
  }
  
  // Step 6: Detect clutches
  const clutchHighlights = detectClutches(rounds, detection.minEnemies, priorities);
  highlights.push(...clutchHighlights);
  
  return highlights;
}

export {
  detectHighlightsV2,
  detectKillSeries,
  detectCollaterals,
  detectKnifeKills,
  detectOneTaps,
  detectClutches,
  getKillTicksInSeries,
  getKnifeKillsInSeries,
  PRIORITIES,
  HIGHLIGHT_TYPES,
};
