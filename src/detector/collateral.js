/**
 * @fileoverview Collateral kill detection module
 * 
 * Detects collateral kills - multiple enemies killed with a single shot.
 * This happens when a bullet penetrates through one enemy into another,
 * or with weapons that have splash damage.
 * 
 * Collaterals are identified by same attacker + same tick for 2+ kills.
 */

import { KILL_POINTS, PRIORITIES } from './constants.js';
import { groupBy, calculateTotalPoints } from './utils.js';
import { createCollateralHighlight } from './highlightFactory.js';

/**
 * Detect collateral kills from all kills in demo
 * 
 * Algorithm:
 * 1. Group kills by attacker + tick combination
 * 2. Filter groups with 2+ kills (single shot, multiple kills)
 * 3. Create highlight for each qualifying group
 * 
 * Note: Same tick = same server frame = essentially same moment
 * In CS:GO/CS2, tick rate is typically 64-128, so same tick means < 16ms apart
 * 
 * @param {Array} kills - All kill events from parser
 * @param {Object} [killPoints=KILL_POINTS] - Point configuration
 * @param {Object} [priorities=PRIORITIES] - Priority configuration
 * @returns {Array} Array of collateral highlight objects
 */
function detectCollaterals(kills, killPoints = KILL_POINTS, priorities = PRIORITIES) {
  const highlights = [];
  
  // Group kills by attacker + tick (unique key for potential collateral)
  const killsByAttackerAndTick = groupBy(
    kills,
    kill => `${kill.attacker.name}_${kill.tick}`
  );

  // Find groups with 2+ kills (collateral = multiple kills on same tick)
  for (const [, tickKills] of killsByAttackerAndTick) {
    if (!isCollateral(tickKills)) {
      continue;
    }
    
    const highlight = buildCollateralHighlight(tickKills, killPoints, priorities);
    highlights.push(highlight);
  }

  return highlights;
}

/**
 * Check if kills qualify as a collateral
 * 
 * @private
 * @param {Array} tickKills - Kills that occurred on same tick
 * @returns {boolean} True if this is a collateral (2+ kills)
 */
function isCollateral(tickKills) {
  return tickKills.length >= 2;
}

/**
 * Build a collateral highlight from qualifying kills
 * 
 * @private
 * @param {Array} tickKills - Kills on the same tick
 * @param {Object} killPoints - Point configuration
 * @param {Object} priorities - Priority configuration
 * @returns {Object} Collateral highlight object
 */
function buildCollateralHighlight(tickKills, killPoints, priorities) {
  const firstKill = tickKills[0];
  
  // Extract relevant data for each kill
  const killsData = tickKills.map(k => ({
    tick: k.tick,
    weapon: k.weapon,
    headshot: k.headshot,
    noscope: k.noscope || false,
  }));
  
  return createCollateralHighlight({
    player: firstKill.attacker,
    tick: firstKill.tick,
    killCount: tickKills.length,
    points: calculateTotalPoints(tickKills, killPoints),
    kills: killsData,
    priorities,
  });
}

export {
  detectCollaterals,
};
