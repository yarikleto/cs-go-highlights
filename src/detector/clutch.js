/**
 * @fileoverview Clutch situation detection module
 * 
 * Detects clutch situations - when a player wins a round while outnumbered.
 * Clutches are marked in round data by the parser when:
 * - Player's team has only 1 alive vs multiple enemies
 * - Player's team wins the round
 * 
 * Example: 1v3 clutch = player alone vs 3 enemies, wins the round
 */

import { PRIORITIES, CLUTCH_POINTS_MULTIPLIER } from './constants.js';
import { createClutchHighlight } from './highlightFactory.js';

/**
 * Detect clutch situations from round data
 * 
 * Algorithm:
 * 1. Filter rounds that have clutchSituation data
 * 2. Verify clutch player's team won the round
 * 3. Check minimum enemies requirement
 * 4. Require at least 1 kill by clutch player (can't just hide and win)
 * 
 * @param {Array} rounds - All round data from parser
 * @param {number} minEnemies - Minimum enemies for clutch to count (default: 2 for 1v2)
 * @param {Object} [priorities=PRIORITIES] - Priority configuration
 * @returns {Array} Array of clutch highlight objects
 */
function detectClutches(rounds, minEnemies, priorities = PRIORITIES) {
  const highlights = [];
  
  for (const round of rounds) {
    // Skip rounds without clutch situation data
    if (!hasClutchSituation(round)) {
      continue;
    }
    
    // Validate clutch meets criteria
    if (!isValidClutch(round, minEnemies)) {
      continue;
    }
    
    const highlight = buildClutchHighlight(round, priorities);
    highlights.push(highlight);
  }

  return highlights;
}

/**
 * Check if round has clutch situation data
 * 
 * @private
 * @param {Object} round - Round data
 * @returns {boolean} True if round has clutch situation
 */
function hasClutchSituation(round) {
  return Boolean(round.clutchSituation);
}

/**
 * Validate that clutch meets all requirements
 * 
 * Requirements:
 * 1. Clutch player's team won the round
 * 2. Enemy count meets minimum threshold
 * 3. Clutch player got at least 1 kill (active participation)
 * 
 * @private
 * @param {Object} round - Round data with clutchSituation
 * @param {number} minEnemies - Minimum enemies required
 * @returns {boolean} True if clutch is valid highlight
 */
function isValidClutch(round, minEnemies) {
  const { clutchSituation, winner } = round;
  
  // Team must have won for it to be a successful clutch
  if (clutchSituation.team !== winner) {
    return false;
  }
  
  // Must face minimum number of enemies (1v2 vs 1v1 etc)
  if (clutchSituation.enemies < minEnemies) {
    return false;
  }
  
  // Player must have gotten at least 1 kill
  // (Winning by time/objective without kills is less impressive)
  const kills = clutchSituation.kills || [];
  if (kills.length < 1) {
    return false;
  }
  
  return true;
}

/**
 * Calculate clutch points based on difficulty
 * More enemies = more impressive = more points
 * 
 * @private
 * @param {number} enemies - Number of enemies faced
 * @returns {number} Points value
 */
function calculateClutchPoints(enemies) {
  return enemies * CLUTCH_POINTS_MULTIPLIER;
}

/**
 * Build a clutch highlight from round data
 * 
 * @private
 * @param {Object} round - Round data with clutchSituation
 * @param {Object} priorities - Priority configuration
 * @returns {Object} Clutch highlight object
 */
function buildClutchHighlight(round, priorities) {
  const { clutchSituation, endTick, number } = round;
  
  return createClutchHighlight({
    player: clutchSituation.player,
    round: number,
    situation: `1v${clutchSituation.enemies}`,
    startTick: clutchSituation.startTick,
    endTick: endTick,
    points: calculateClutchPoints(clutchSituation.enemies),
    kills: clutchSituation.kills || [],
    priorities,
  });
}

export {
  detectClutches,
};
