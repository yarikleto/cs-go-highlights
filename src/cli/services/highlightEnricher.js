/**
 * @fileoverview Highlight enrichment service
 * 
 * Transforms raw highlight data into playback-ready highlights with:
 * - Unique IDs for tracking
 * - Playback boundaries (with padding)
 * - Speed-up segments for idle periods
 * - Slow motion triggers for impressive kills
 * 
 * This is one of the most complex parts of the pipeline - it bridges
 * the gap between "what happened" (detection) and "how to show it" (recording).
 */

import crypto from 'crypto';
import { roundSeconds, secondsToTicks } from '../utils/time.js';

/**
 * Enrich a highlight with playback metadata
 * 
 * Adds: id, demoFile, durationSeconds, killGapSum, playback { startTick, endTick, ... }
 * 
 * @param {Object} highlight - Raw highlight from detector
 * @param {Object} demoData - Demo data (tickRate, rounds, shotsByPlayer)
 * @param {string} demoFile - Demo filename
 * @param {Object} config - Configuration object
 * @returns {Object} Enriched highlight with playback data
 */
function enrichHighlight(highlight, demoData, demoFile, config) {
  const { tickRate, rounds, shotsByPlayer } = demoData;
  
  // Get tick range for highlight
  const { startTick, endTick } = getHighlightTickRange(highlight);
  
  // Generate stable unique ID
  const id = generateHighlightId(demoFile, highlight, startTick, endTick);
  
  // Calculate duration
  const durationSeconds = roundSeconds((endTick - startTick) / tickRate);
  
  // Calculate total time between kills (intensity metric)
  const killGapSum = calculateKillGapSum(highlight, tickRate);
  
  // Calculate playback boundaries with padding
  const playback = calculatePlaybackBoundaries(
    startTick,
    endTick,
    tickRate,
    rounds,
    config.padding
  );
  
  // Calculate speed-up segments for action gaps
  const speedupSegments = calculateSpeedupSegments(
    highlight,
    playback,
    tickRate,
    shotsByPlayer,
    config.speedup
  );
  
  // Calculate slow motion moment
  const slowmotion = calculateSlowmotion(
    highlight,
    playback,
    tickRate,
    config.slowmo
  );
  
  return {
    id,
    ...highlight,
    demoFile,
    durationSeconds,
    killGapSum,
    playback: {
      ...playback,
      speedupSegments,
      slowmotion,
    },
  };
}

/**
 * Get tick range for a highlight (handles different highlight types)
 * 
 * Single-tick highlights (knife, collateral): tick -> tick
 * Range highlights (kill-series, clutch): startTick -> endTick
 * 
 * @param {Object} highlight - Highlight object
 * @returns {{ startTick: number, endTick: number }}
 */
function getHighlightTickRange(highlight) {
  if (highlight.tick !== undefined) {
    // Single-tick highlight
    return { startTick: highlight.tick, endTick: highlight.tick };
  }
  // Range highlight
  return { startTick: highlight.startTick, endTick: highlight.endTick };
}

/**
 * Generate a unique, stable ID for a highlight
 * 
 * ID is based on: demo file, player, type, and tick range
 * This ensures the same highlight always gets the same ID across re-runs
 * 
 * @param {string} demoFile - Demo filename
 * @param {Object} highlight - Highlight object
 * @param {number} startTick - Start tick
 * @param {number} endTick - End tick
 * @returns {string} 12-character hex ID
 */
function generateHighlightId(demoFile, highlight, startTick, endTick) {
  const idSource = `${demoFile}|${highlight.player.steamId}|${highlight.type}|${startTick}|${endTick}`;
  return crypto.createHash('sha256').update(idSource).digest('hex').substring(0, 12);
}

/**
 * Calculate total time between consecutive kills (intensity metric)
 * 
 * Lower value = more intense/exciting highlight (kills happen faster)
 * Can be used to rank highlights by "intensity" or "action density"
 * 
 * For single-kill highlights (knife, solo, collateral at same tick): returns 0
 * For multi-kill highlights: sum of gaps between each consecutive kill
 * 
 * @param {Object} highlight - Highlight object with kills array
 * @param {number} tickRate - Server tick rate
 * @returns {number} Total gap time in seconds (0 for single-kill highlights)
 */
function calculateKillGapSum(highlight, tickRate) {
  // Must have kills array with at least 2 kills to have gaps
  if (!highlight.kills || highlight.kills.length < 2) {
    return 0;
  }
  
  // Sort kills by tick (should already be sorted, but ensure)
  const sortedKills = [...highlight.kills].sort((a, b) => a.tick - b.tick);
  
  let totalGapTicks = 0;
  for (let i = 1; i < sortedKills.length; i++) {
    const gap = sortedKills[i].tick - sortedKills[i - 1].tick;
    totalGapTicks += gap;
  }
  
  return roundSeconds(totalGapTicks / tickRate);
}

/**
 * Calculate playback boundaries with padding and round constraints
 * 
 * Rules:
 * - Add padding before and after highlight
 * - Never show content from the next round
 * - Cap at round end + 2 second buffer
 * - Handle edge cases (warmup, last round, etc.)
 * 
 * @param {number} startTick - Highlight start tick
 * @param {number} endTick - Highlight end tick
 * @param {number} tickRate - Server tick rate
 * @param {Array} rounds - Round data array
 * @param {Object} paddingConfig - Padding configuration
 * @returns {Object} Playback boundaries
 */
function calculatePlaybackBoundaries(startTick, endTick, tickRate, rounds, paddingConfig) {
  const paddingBeforeTicks = secondsToTicks(paddingConfig.before, tickRate);
  const paddingAfterTicks = secondsToTicks(paddingConfig.after, tickRate);
  
  // Start with simple padding
  const playbackStartTick = Math.max(0, startTick - paddingBeforeTicks);
  let playbackEndTick = endTick + paddingAfterTicks;
  
  // Find the round containing this highlight
  const containingRound = rounds.find(r => 
    r.startTick <= endTick && r.endTick && r.endTick >= endTick
  );
  
  const firstRound = rounds[0];
  const lastRound = rounds[rounds.length - 1];
  const roundEndBuffer = secondsToTicks(2, tickRate); // 2 seconds after round end
  
  // Find next round to ensure we NEVER show new round visuals
  const roundIndex = containingRound ? rounds.indexOf(containingRound) : -1;
  const nextRound = roundIndex >= 0 ? rounds[roundIndex + 1] : null;
  
  if (containingRound && containingRound.endTick) {
    // Cap at round end + buffer
    let cappedEnd = containingRound.endTick + roundEndBuffer;
    
    // Also cap at next round start to NEVER show new round
    if (nextRound && nextRound.startTick) {
      cappedEnd = Math.min(cappedEnd, nextRound.startTick);
    }
    
    playbackEndTick = Math.min(playbackEndTick, cappedEnd);
  }
  
  // Cap at demo end (last round's end + buffer)
  if (lastRound && lastRound.endTick) {
    playbackEndTick = Math.min(playbackEndTick, lastRound.endTick + roundEndBuffer);
  }
  
  // Handle warmup/pre-game highlights (before Round 1's startTick)
  if (!containingRound && firstRound && endTick < firstRound.startTick) {
    // Use minimal padding, capped at Round 1 start
    const minimalPadding = secondsToTicks(2, tickRate);
    playbackEndTick = Math.min(endTick + minimalPadding, firstRound.startTick);
  }
  
  const durationSeconds = roundSeconds((playbackEndTick - playbackStartTick) / tickRate);
  
  return {
    startTick: playbackStartTick,
    endTick: playbackEndTick,
    durationSeconds,
    paddingBefore: paddingConfig.before,
    paddingAfter: paddingConfig.after,
  };
}

/**
 * Calculate speed-up segments for gaps between action
 * 
 * This is the most complex calculation - finds "boring" periods
 * where the player isn't shooting or getting kills, and marks
 * them for speed-up during playback.
 * 
 * Algorithm:
 * 1. Collect all action ticks (shots + kills)
 * 2. Group nearby ticks into "action periods"
 * 3. Find gaps between action periods
 * 4. Filter gaps by minimum duration
 * 
 * @param {Object} highlight - Highlight object (must have kills array)
 * @param {Object} playback - Playback boundaries
 * @param {number} tickRate - Server tick rate
 * @param {Object} shotsByPlayer - Map of steamId -> shot ticks
 * @param {Object} speedupConfig - Speed-up configuration
 * @returns {Array|null} Speed-up segments or null if none
 */
function calculateSpeedupSegments(highlight, playback, tickRate, shotsByPlayer, speedupConfig) {
  // Only apply to multi-kill highlights
  const eligibleTypes = ['clutch', 'kill-series'];
  if (!eligibleTypes.includes(highlight.type) || !highlight.kills || highlight.kills.length === 0) {
    return null;
  }
  
  const { startTick, endTick } = playback;
  const { startDelay, bufferAroundKills, minGapDuration } = speedupConfig;
  
  const startDelayTicks = secondsToTicks(startDelay, tickRate);
  const bufferTicks = secondsToTicks(bufferAroundKills, tickRate);
  const minGapTicks = secondsToTicks(minGapDuration, tickRate);
  
  // Get all shots by this player within playback range
  const playerSteamId = highlight.player.steamId;
  const allPlayerShots = (shotsByPlayer && playerSteamId && shotsByPlayer[playerSteamId])
    ? shotsByPlayer[playerSteamId].filter(tick => tick >= startTick && tick <= endTick)
    : [];
  
  // Combine shots with kill ticks (for knife kills that don't have weapon_fire events)
  const killTicks = highlight.kills.map(k => k.tick);
  const allActionTicks = [...allPlayerShots, ...killTicks].sort((a, b) => a - b);
  
  // Remove duplicates
  const uniqueActionTicks = allActionTicks.filter((tick, i, arr) => 
    i === 0 || tick !== arr[i - 1]
  );
  
  if (uniqueActionTicks.length === 0) {
    return null;
  }
  
  // Group consecutive action ticks into "action periods"
  // Ticks within 1 second of each other are grouped together
  const actionPeriods = groupActionTicks(uniqueActionTicks, tickRate);
  
  // Build action points with buffer
  const actionPoints = actionPeriods.map(period => ({
    startAction: period.start - bufferTicks,  // Stop speedup before action
    endAction: period.end + bufferTicks,      // Resume speedup after action
  }));
  
  // Find gaps between action moments
  const segments = [];
  let currentPos = startTick + startDelayTicks;
  
  for (const action of actionPoints) {
    const segmentEnd = action.startAction;
    
    // Only create segment if after start delay and long enough
    if (segmentEnd > currentPos && segmentEnd - currentPos >= minGapTicks) {
      segments.push({
        startTick: currentPos,
        endTick: segmentEnd,
        durationTicks: segmentEnd - currentPos,
        durationSeconds: roundSeconds((segmentEnd - currentPos) / tickRate),
      });
    }
    
    // Move position to after this action
    currentPos = Math.max(action.endAction, startTick + startDelayTicks);
  }
  
  // Final segment: from last action to end
  if (endTick - currentPos >= minGapTicks) {
    segments.push({
      startTick: currentPos,
      endTick: endTick,
      durationTicks: endTick - currentPos,
      durationSeconds: roundSeconds((endTick - currentPos) / tickRate),
    });
  }
  
  return segments.length > 0 ? segments : null;
}

/**
 * Group nearby action ticks into periods
 * 
 * @param {number[]} ticks - Sorted action tick array
 * @param {number} tickRate - Server tick rate
 * @returns {Array<{start: number, end: number}>} Action periods
 */
function groupActionTicks(ticks, tickRate) {
  const actionGroupGap = tickRate * 1; // 1 second gap = separate periods
  const periods = [];
  
  let periodStart = ticks[0];
  let periodEnd = ticks[0];
  
  for (let i = 1; i < ticks.length; i++) {
    const tick = ticks[i];
    if (tick - periodEnd <= actionGroupGap) {
      // Continue current period
      periodEnd = tick;
    } else {
      // End current period, start new one
      periods.push({ start: periodStart, end: periodEnd });
      periodStart = tick;
      periodEnd = tick;
    }
  }
  
  // Add final period
  periods.push({ start: periodStart, end: periodEnd });
  
  return periods;
}

/**
 * Calculate slow motion moment for impressive kills
 * 
 * Trigger conditions:
 * - Collaterals (always - they're always impressive)
 * - Headshots (precision)
 * - Noscopes (style)
 * 
 * For series/clutches: finds the LAST qualifying kill
 * Effect: instant slowdown at kill, then gradual ramp back to normal
 * 
 * @param {Object} highlight - Highlight object
 * @param {Object} playback - Playback boundaries
 * @param {number} tickRate - Server tick rate
 * @param {Object} slowmoConfig - Slow motion configuration
 * @returns {Object|null} Slow motion data or null if none
 */
function calculateSlowmotion(highlight, playback, tickRate, slowmoConfig) {
  const eligibleTypes = ['kill-series', 'clutch', 'collateral', 'solo'];
  if (!eligibleTypes.includes(highlight.type) || !highlight.kills || highlight.kills.length === 0) {
    return null;
  }
  
  let qualifyingKill = null;
  
  if (highlight.type === 'collateral') {
    // Collaterals always get slowmo (all same tick anyway)
    qualifyingKill = highlight.kills[0];
  } else if (highlight.type === 'solo') {
    // Solo kills: slowmo if headshot or noscope
    const kill = highlight.kills[0];
    if (kill.headshot === true || kill.noscope === true) {
      qualifyingKill = kill;
    }
  } else {
    // For series/clutch: find the LAST headshot/noscope kill
    for (let i = highlight.kills.length - 1; i >= 0; i--) {
      const kill = highlight.kills[i];
      if (kill.headshot === true || kill.noscope === true) {
        qualifyingKill = kill;
        break;
      }
    }
  }
  
  if (!qualifyingKill) {
    return null;
  }
  
  // Slowmo starts AT the kill and ramps back to normal
  const slowmoStartTick = qualifyingKill.tick;
  const slowmoEndTick = qualifyingKill.tick + secondsToTicks(slowmoConfig.duration, tickRate);
  
  // Determine reason for slowmo
  let reason;
  if (highlight.type === 'collateral') {
    reason = 'collateral';
  } else if (qualifyingKill.noscope) {
    reason = 'noscope';
  } else {
    reason = 'headshot';
  }
  
  return {
    tick: qualifyingKill.tick,
    startTick: Math.max(slowmoStartTick, playback.startTick),
    endTick: Math.min(slowmoEndTick, playback.endTick),
    durationSeconds: slowmoConfig.duration,
    reason,
    weapon: qualifyingKill.weapon,
    // Visual effects at peak (fade out with slowmo)
    contrast: slowmoConfig.contrast,
    brightness: slowmoConfig.brightness,
    redBoost: slowmoConfig.redBoost,
    saturation: slowmoConfig.saturation,
  };
}

/**
 * Enrich all highlights in a demo
 * 
 * @param {Array} highlights - Raw highlights from detector
 * @param {Object} demoData - Demo data
 * @param {string} demoFile - Demo filename
 * @param {Object} config - Configuration object
 * @returns {Array} Enriched highlights
 */
function enrichAllHighlights(highlights, demoData, demoFile, config) {
  return highlights.map(h => enrichHighlight(h, demoData, demoFile, config));
}

export {
  enrichHighlight,
  enrichAllHighlights,
  getHighlightTickRange,
  generateHighlightId,
  calculateKillGapSum,
  calculatePlaybackBoundaries,
  calculateSpeedupSegments,
  calculateSlowmotion,
};
