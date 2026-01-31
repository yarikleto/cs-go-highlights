/**
 * @fileoverview Utility functions for highlight enrichment
 * 
 * Contains helper functions shared across enrichment modules:
 * - Tick range extraction
 * - Kill gap calculation (intensity metric)
 */

import crypto from 'crypto';
import { roundSeconds } from '../../utils/time.js';

/**
 * Get tick range for a highlight (handles different highlight types)
 * 
 * Different highlight types store their timing differently:
 * - Single-tick (knife, collateral, one-tap): uses `tick` property
 * - Range (kill-series, clutch): uses `startTick` and `endTick`
 * 
 * @param {Object} highlight - Highlight object
 * @returns {{ startTick: number, endTick: number }}
 */
function getHighlightTickRange(highlight) {
  if (highlight.tick !== undefined) {
    // Single-tick highlight (knife, collateral, one-tap)
    return { startTick: highlight.tick, endTick: highlight.tick };
  }
  // Range highlight (kill-series, clutch)
  return { startTick: highlight.startTick, endTick: highlight.endTick };
}

/**
 * Generate a unique, stable ID for a highlight
 * 
 * ID is deterministic - same input always produces same ID.
 * This allows re-running analysis without changing IDs.
 * 
 * Components: demoFile + steamId + type + startTick + endTick
 * Output: 12-character hex string (SHA-256 truncated)
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
 * This metric measures how "action-packed" a highlight is:
 * - Lower value = kills happen faster = more intense
 * - Higher value = more spread out = less intense
 * 
 * Use cases:
 * - Rank highlights by intensity
 * - Filter out "slow" highlights
 * - Adjust playback speed dynamically
 * 
 * @param {Object} highlight - Highlight object with kills array
 * @param {number} tickRate - Server tick rate
 * @returns {number} Total gap time in seconds (0 for single-kill highlights)
 * 
 * @example
 * // 3K with 2 seconds between each kill
 * calculateKillGapSum(highlight, 128) // Returns ~4.0 seconds
 * 
 * // Collateral (same tick)
 * calculateKillGapSum(collateral, 128) // Returns 0
 */
function calculateKillGapSum(highlight, tickRate) {
  // Must have kills array with at least 2 kills to have gaps
  if (!highlight.kills || highlight.kills.length < 2) {
    return 0;
  }
  
  // Sort kills by tick (should already be sorted, but ensure correctness)
  const sortedKills = [...highlight.kills].sort((a, b) => a.tick - b.tick);
  
  let totalGapTicks = 0;
  for (let i = 1; i < sortedKills.length; i++) {
    const gap = sortedKills[i].tick - sortedKills[i - 1].tick;
    totalGapTicks += gap;
  }
  
  return roundSeconds(totalGapTicks / tickRate);
}

export {
  getHighlightTickRange,
  generateHighlightId,
  calculateKillGapSum,
};
