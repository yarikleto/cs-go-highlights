/**
 * @fileoverview Speed-up segment calculation
 * 
 * Identifies "boring" periods in highlights that can be sped up.
 * This keeps videos engaging by fast-forwarding through downtime.
 * 
 * ALGORITHM OVERVIEW:
 * ───────────────────────────────────────────────────────────────
 * 1. Collect all "action ticks" (shots fired + kills)
 * 2. Group nearby ticks into "action periods" (within 1 second)
 * 3. Find gaps between action periods
 * 4. Create speedup segments for gaps exceeding minimum duration
 * 
 * VISUAL TIMELINE:
 * ───────────────────────────────────────────────────────────────
 * Time:    [--delay--][action][--GAP--][action][--GAP--][action]
 * Speed:   [  normal ][normal][ FAST  ][normal][ FAST  ][normal]
 *                             ↑ speedup        ↑ speedup
 * 
 * Buffer around action ensures we don't cut into the action itself.
 */

import { roundSeconds, secondsToTicks } from '../../utils/time.js';

/**
 * Highlight types eligible for speedup (multi-kill only)
 */
const SPEEDUP_ELIGIBLE_TYPES = ['clutch', 'kill-series'];

/**
 * Gap between action ticks to consider them separate periods (seconds)
 */
const ACTION_GROUP_GAP_SECONDS = 1;

/**
 * Calculate speed-up segments for gaps between action
 * 
 * Only applies to multi-kill highlights where there's meaningful
 * downtime between engagements (clutches, kill series).
 * 
 * @param {Object} highlight - Highlight object (must have kills array)
 * @param {Object} playback - Playback boundaries { startTick, endTick }
 * @param {number} tickRate - Server tick rate
 * @param {Object} shotsByPlayer - Map of steamId -> shot ticks
 * @param {Object} speedupConfig - Configuration:
 *   - startDelay: Seconds before first speedup can start
 *   - bufferAroundKills: Seconds of normal speed around action
 *   - minGapDuration: Minimum gap length to speed up
 * @returns {Array|null} Speed-up segments or null if none
 */
function calculateSpeedupSegments(highlight, playback, tickRate, shotsByPlayer, speedupConfig) {
  // Only multi-kill highlights benefit from speedup
  if (!isEligibleForSpeedup(highlight)) {
    return null;
  }
  
  const actionTicks = collectActionTicks(highlight, playback, shotsByPlayer);
  if (actionTicks.length === 0) {
    return null;
  }
  
  const actionPeriods = groupActionTicks(actionTicks, tickRate);
  const segments = findSpeedupGaps(
    actionPeriods,
    playback,
    tickRate,
    speedupConfig
  );
  
  return segments.length > 0 ? segments : null;
}

/**
 * Check if highlight type is eligible for speedup
 * 
 * @param {Object} highlight - Highlight object
 * @returns {boolean} True if eligible
 */
function isEligibleForSpeedup(highlight) {
  return SPEEDUP_ELIGIBLE_TYPES.includes(highlight.type) 
    && highlight.kills 
    && highlight.kills.length > 0;
}

/**
 * Collect all action ticks within playback range
 * 
 * Action = shots fired OR kills made (knife kills don't fire weapon_fire)
 * 
 * @param {Object} highlight - Highlight with player info and kills
 * @param {Object} playback - Playback boundaries
 * @param {Object} shotsByPlayer - Shot data from parser
 * @returns {number[]} Sorted, unique action tick array
 */
function collectActionTicks(highlight, playback, shotsByPlayer) {
  const { startTick, endTick } = playback;
  const playerSteamId = highlight.player.steamId;
  
  // Get all shots by this player within playback range
  const playerShots = getPlayerShotsInRange(
    shotsByPlayer, 
    playerSteamId, 
    startTick, 
    endTick
  );
  
  // Get kill ticks (knife kills don't have weapon_fire events)
  const killTicks = highlight.kills.map(k => k.tick);
  
  // Combine and sort
  const allTicks = [...playerShots, ...killTicks].sort((a, b) => a - b);
  
  // Remove duplicates
  return allTicks.filter((tick, i, arr) => i === 0 || tick !== arr[i - 1]);
}

/**
 * Get player shots within a tick range
 * 
 * @param {Object} shotsByPlayer - Map of steamId -> shot ticks
 * @param {string} steamId - Player's Steam ID
 * @param {number} startTick - Range start
 * @param {number} endTick - Range end
 * @returns {number[]} Shot ticks in range
 */
function getPlayerShotsInRange(shotsByPlayer, steamId, startTick, endTick) {
  if (!shotsByPlayer || !steamId || !shotsByPlayer[steamId]) {
    return [];
  }
  return shotsByPlayer[steamId].filter(tick => 
    tick >= startTick && tick <= endTick
  );
}

/**
 * Group nearby action ticks into continuous periods
 * 
 * Ticks within ACTION_GROUP_GAP_SECONDS of each other are grouped.
 * This prevents creating micro-segments between rapid shots.
 * 
 * @param {number[]} ticks - Sorted action tick array
 * @param {number} tickRate - Server tick rate
 * @returns {Array<{start: number, end: number}>} Action periods
 * 
 * @example
 * // Shots at ticks: 100, 110, 120, 500, 510
 * // With 128 tickRate (1s = 128 ticks)
 * // Returns: [{ start: 100, end: 120 }, { start: 500, end: 510 }]
 */
function groupActionTicks(ticks, tickRate) {
  if (ticks.length === 0) return [];
  
  const maxGapTicks = tickRate * ACTION_GROUP_GAP_SECONDS;
  const periods = [];
  
  let periodStart = ticks[0];
  let periodEnd = ticks[0];
  
  for (let i = 1; i < ticks.length; i++) {
    const tick = ticks[i];
    
    if (tick - periodEnd <= maxGapTicks) {
      // Continue current period
      periodEnd = tick;
    } else {
      // Save current period, start new one
      periods.push({ start: periodStart, end: periodEnd });
      periodStart = tick;
      periodEnd = tick;
    }
  }
  
  // Don't forget the last period
  periods.push({ start: periodStart, end: periodEnd });
  
  return periods;
}

/**
 * Find gaps between action periods to speed up
 * 
 * @param {Array} actionPeriods - Grouped action periods
 * @param {Object} playback - Playback boundaries
 * @param {number} tickRate - Server tick rate
 * @param {Object} config - Speedup configuration
 * @returns {Array} Speed-up segments
 */
function findSpeedupGaps(actionPeriods, playback, tickRate, config) {
  const { startTick, endTick } = playback;
  const { startDelay, bufferAroundKills, minGapDuration } = config;
  
  const startDelayTicks = secondsToTicks(startDelay, tickRate);
  const bufferTicks = secondsToTicks(bufferAroundKills, tickRate);
  const minGapTicks = secondsToTicks(minGapDuration, tickRate);
  
  // Build action points with buffer zones
  // Buffer ensures we don't cut right into the action
  const actionPoints = actionPeriods.map(period => ({
    startAction: period.start - bufferTicks,  // Stop speedup BEFORE action
    endAction: period.end + bufferTicks,      // Resume speedup AFTER action
  }));
  
  const segments = [];
  let currentPos = startTick + startDelayTicks;  // Start after initial delay
  
  // Find gaps between action points
  for (const action of actionPoints) {
    const segmentEnd = action.startAction;
    
    // Create segment if:
    // 1. It's after our current position
    // 2. It's long enough to be worth speeding up
    if (segmentEnd > currentPos && segmentEnd - currentPos >= minGapTicks) {
      segments.push(createSpeedupSegment(currentPos, segmentEnd, tickRate));
    }
    
    // Move past this action
    currentPos = Math.max(action.endAction, startTick + startDelayTicks);
  }
  
  // Check for final segment (from last action to playback end)
  if (endTick - currentPos >= minGapTicks) {
    segments.push(createSpeedupSegment(currentPos, endTick, tickRate));
  }
  
  return segments;
}

/**
 * Create a speedup segment object
 * 
 * @param {number} startTick - Segment start
 * @param {number} endTick - Segment end
 * @param {number} tickRate - Server tick rate
 * @returns {Object} Speedup segment
 */
function createSpeedupSegment(startTick, endTick, tickRate) {
  return {
    startTick,
    endTick,
    durationTicks: endTick - startTick,
    durationSeconds: roundSeconds((endTick - startTick) / tickRate),
  };
}

export {
  calculateSpeedupSegments,
  groupActionTicks,
  isEligibleForSpeedup,
};
