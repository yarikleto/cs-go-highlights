/**
 * @fileoverview Knife kill detection module
 * 
 * Detects knife kills - melee kills that show dominance.
 * Knife kills are risky (must be at melee range) and often humiliating.
 * 
 * Knife kills that are part of a kill series are excluded
 * to avoid duplicate highlights.
 */

const { KILL_POINTS, PRIORITIES } = require('./constants');
const { calculateKillPoints, getPlayerId } = require('./utils');
const { createKnifeHighlight } = require('./highlightFactory');

/**
 * Detect standalone knife kills
 * 
 * Algorithm:
 * 1. Filter all kills to find knife kills
 * 2. Exclude knife kills that are already part of a kill series
 * 3. Create highlight for remaining knife kills
 * 
 * @param {Array} kills - All kill events from parser
 * @param {Object} [killPoints=KILL_POINTS] - Point configuration
 * @param {Object} [priorities=PRIORITIES] - Priority configuration
 * @param {Set<string>} [excludeKills=new Set()] - Kill keys to exclude (e.g., knives in series)
 * @returns {Array} Array of knife kill highlight objects
 */
function detectKnifeKills(kills, killPoints = KILL_POINTS, priorities = PRIORITIES, excludeKills = new Set()) {
  const highlights = [];
  
  for (const kill of kills) {
    // Skip non-knife kills
    if (!kill.isKnife) {
      continue;
    }
    
    // Skip knife kills that are part of a kill series
    // These are already represented in the series highlight
    if (isExcludedKill(kill, excludeKills)) {
      continue;
    }
    
    const highlight = buildKnifeHighlight(kill, killPoints, priorities);
    highlights.push(highlight);
  }

  return highlights;
}

/**
 * Check if a kill should be excluded (already in a series)
 * 
 * @private
 * @param {Object} kill - Kill event to check
 * @param {Set<string>} excludeKills - Set of excluded kill keys
 * @returns {boolean} True if kill should be excluded
 */
function isExcludedKill(kill, excludeKills) {
  const playerKey = getPlayerId(kill.attacker);
  const killKey = `${playerKey}_${kill.tick}`;
  return excludeKills.has(killKey);
}

/**
 * Build a knife kill highlight
 * 
 * @private
 * @param {Object} kill - Knife kill event
 * @param {Object} killPoints - Point configuration
 * @param {Object} priorities - Priority configuration
 * @returns {Object} Knife highlight object
 */
function buildKnifeHighlight(kill, killPoints, priorities) {
  return createKnifeHighlight({
    player: kill.attacker,
    tick: kill.tick,
    points: calculateKillPoints(kill, killPoints),
    weapon: kill.weapon,
    priorities,
  });
}

module.exports = {
  detectKnifeKills,
};
