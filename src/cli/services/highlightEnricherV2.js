/**
 * @fileoverview Highlight Enrichment V2 - Minimal version
 * 
 * This is a simplified enricher that only adds:
 * - id (unique identifier)
 * - demoFile
 * - durationSeconds
 * - killGapSum (intensity metric)
 * - roundStartTick, roundEndTick (for postprocess-ui)
 * 
 * Does NOT calculate:
 * - playback boundaries
 * - speedupSegments
 * - slowmotion
 * 
 * Those are calculated by analyze-postprocess-ui command.
 */

import crypto from 'crypto';
import { roundSeconds } from '../utils/time.js';

/**
 * Get tick range for a highlight
 */
function getHighlightTickRange(highlight) {
  if (highlight.tick !== undefined) {
    return { startTick: highlight.tick, endTick: highlight.tick };
  }
  return { startTick: highlight.startTick, endTick: highlight.endTick };
}

/**
 * Generate unique stable ID
 */
function generateHighlightId(demoFile, highlight, startTick, endTick) {
  const idSource = `${demoFile}|${highlight.player.steamId}|${highlight.type}|${startTick}|${endTick}`;
  return crypto.createHash('sha256').update(idSource).digest('hex').substring(0, 12);
}

/**
 * Calculate total gap time between kills
 */
function calculateKillGapSum(highlight, tickRate) {
  if (!highlight.kills || highlight.kills.length < 2) {
    return 0;
  }
  
  const sortedKills = [...highlight.kills].sort((a, b) => a.tick - b.tick);
  
  let totalGapTicks = 0;
  for (let i = 1; i < sortedKills.length; i++) {
    totalGapTicks += sortedKills[i].tick - sortedKills[i - 1].tick;
  }
  
  return roundSeconds(totalGapTicks / tickRate);
}

/**
 * Find round containing a tick
 */
function findContainingRound(tick, rounds) {
  return rounds.find(r => 
    r.startTick <= tick && r.endTick && r.endTick >= tick
  ) || null;
}

/**
 * Get player shots within a tick range (with padding for speedup context)
 */
function getPlayerShotsInRange(shotsByPlayer, steamId, startTick, endTick, tickRate) {
  if (!shotsByPlayer || !steamId || !shotsByPlayer[steamId]) {
    return [];
  }
  
  // Add padding for speedup calculation context
  const paddingTicks = tickRate * 5; // 5 seconds before/after
  const rangeStart = startTick - paddingTicks;
  const rangeEnd = endTick + paddingTicks;
  
  return shotsByPlayer[steamId].filter(tick => 
    tick >= rangeStart && tick <= rangeEnd
  );
}

/**
 * Enrich a single highlight (V2 - minimal)
 * 
 * Only adds basic metadata + round info + player shots for later postprocess-ui.
 * Does NOT calculate playback/speedup/slowmo.
 * 
 * @param {Object} highlight - Raw highlight from detector
 * @param {Object} demoData - Demo metadata { tickRate, rounds, shotsByPlayer }
 * @param {string} demoFile - Demo filename
 * @returns {Object} Enriched highlight with round info and player shots
 */
function enrichHighlightV2(highlight, demoData, demoFile) {
  const { tickRate, rounds, shotsByPlayer } = demoData;
  
  // Get tick range
  const { startTick, endTick } = getHighlightTickRange(highlight);
  
  // Generate stable ID
  const id = generateHighlightId(demoFile, highlight, startTick, endTick);
  
  // Basic metrics
  const durationSeconds = roundSeconds((endTick - startTick) / tickRate);
  const killGapSum = calculateKillGapSum(highlight, tickRate);
  
  // Find containing round for postprocess-ui
  const containingRound = findContainingRound(endTick, rounds);
  
  // Find next round (for boundary capping in postprocess-ui)
  let nextRoundStartTick = null;
  if (containingRound) {
    const roundIndex = rounds.indexOf(containingRound);
    if (roundIndex >= 0 && roundIndex < rounds.length - 1) {
      nextRoundStartTick = rounds[roundIndex + 1].startTick;
    }
  }
  
  // Get player shots for speedup calculation in postprocess-ui
  const playerShots = getPlayerShotsInRange(
    shotsByPlayer,
    highlight.player.steamId,
    startTick,
    endTick,
    tickRate
  );
  
  return {
    id,
    ...highlight,
    demoFile,
    durationSeconds,
    killGapSum,
    // Round info for postprocess-ui
    roundStartTick: containingRound?.startTick || null,
    roundEndTick: containingRound?.endTick || null,
    nextRoundStartTick,
    // Player shots for speedup calculation
    playerShots,
  };
}

/**
 * Enrich all highlights (V2)
 */
function enrichAllHighlightsV2(highlights, demoData, demoFile) {
  return highlights.map(h => enrichHighlightV2(h, demoData, demoFile));
}

export {
  enrichHighlightV2,
  enrichAllHighlightsV2,
  getHighlightTickRange,
  generateHighlightId,
  calculateKillGapSum,
  findContainingRound,
};
