/**
 * @fileoverview Factory for creating highlight objects
 * 
 * Implements Factory Pattern to ensure consistent highlight object structure.
 * All highlight types share common properties but have type-specific fields.
 * 
 * Benefits:
 * - Single source of truth for highlight structure
 * - Easier to add new highlight types
 * - Consistent validation and defaults
 */

import { HIGHLIGHT_TYPES, PRIORITIES } from './constants.js';

/**
 * Base highlight properties shared by all types
 * @typedef {Object} BaseHighlight
 * @property {string} type - Highlight type identifier
 * @property {number} priority - Priority for collision resolution
 * @property {Object} player - Player who made the highlight
 * @property {string} player.name - Player's display name
 * @property {string} [player.steamId] - Player's Steam ID
 * @property {number} points - Score/impressiveness points
 */

/**
 * Create a base highlight object with common properties
 * Private helper - use type-specific factories below
 * 
 * @private
 * @param {string} type - Highlight type from HIGHLIGHT_TYPES
 * @param {Object} player - Player object
 * @param {number} points - Points value
 * @param {Object} [priorities=PRIORITIES] - Custom priorities
 * @returns {BaseHighlight} Base highlight object
 */
function createBaseHighlight(type, player, points, priorities = PRIORITIES) {
  return {
    type,
    priority: priorities[type] ?? PRIORITIES[type],
    player: {
      name: player.name,
      steamId: player.steamId,
    },
    points,
  };
}

/**
 * Create a kill-series highlight
 * 
 * Kill series = consecutive kills within a time window
 * Most complex highlight type with multiple kills tracked
 * 
 * @param {Object} params - Kill series parameters
 * @param {Object} params.player - Player who got the series
 * @param {number} params.startTick - Tick of first kill
 * @param {number} params.endTick - Tick of last kill
 * @param {number} params.killCount - Number of kills in series
 * @param {number} params.points - Total points for series
 * @param {Array} params.kills - Array of individual kill data
 * @param {boolean} params.containsKnife - Whether series includes a knife kill
 * @param {boolean} params.allHeadshotsWithSpecialWeapon - Whether all kills are special headshots
 * @param {Object} [params.priorities] - Custom priorities
 * @returns {Object} Kill series highlight object
 */
function createKillSeriesHighlight({
  player,
  startTick,
  endTick,
  killCount,
  points,
  kills,
  containsKnife,
  allHeadshotsWithSpecialWeapon,
  priorities,
}) {
  return {
    ...createBaseHighlight(HIGHLIGHT_TYPES.KILL_SERIES, player, points, priorities),
    startTick,
    endTick,
    killCount,
    kills,
    containsKnife,
    allHeadshotsWithSpecialWeapon,
  };
}

/**
 * Create a collateral highlight
 * 
 * Collateral = multiple kills with single shot (same tick)
 * Requires penetrating bullet or splash damage
 * 
 * @param {Object} params - Collateral parameters
 * @param {Object} params.player - Player who got the collateral
 * @param {number} params.tick - Tick when collateral occurred
 * @param {number} params.killCount - Number of kills
 * @param {number} params.points - Total points
 * @param {Array} params.kills - Individual kill data
 * @param {Object} [params.priorities] - Custom priorities
 * @returns {Object} Collateral highlight object
 */
function createCollateralHighlight({
  player,
  tick,
  killCount,
  points,
  kills,
  priorities,
}) {
  return {
    ...createBaseHighlight(HIGHLIGHT_TYPES.COLLATERAL, player, points, priorities),
    tick,
    killCount,
    kills,
  };
}

/**
 * Create a knife kill highlight
 * 
 * Knife kills are impressive due to high risk (melee range)
 * Getting a knife kill shows dominance over opponent
 * 
 * @param {Object} params - Knife kill parameters
 * @param {Object} params.player - Player who got the knife kill
 * @param {number} params.tick - Tick when kill occurred
 * @param {number} params.points - Points for the kill
 * @param {string} params.weapon - Specific knife weapon name
 * @param {Object} [params.priorities] - Custom priorities
 * @returns {Object} Knife highlight object
 */
function createKnifeHighlight({
  player,
  tick,
  points,
  weapon,
  priorities,
}) {
  return {
    ...createBaseHighlight(HIGHLIGHT_TYPES.KNIFE, player, points, priorities),
    tick,
    weapon,
  };
}

/**
 * Create a clutch highlight
 * 
 * Clutch = winning round when outnumbered (1vX situation)
 * One of the most impressive plays in competitive games
 * 
 * @param {Object} params - Clutch parameters
 * @param {Object} params.player - Player who clutched
 * @param {number} params.round - Round number
 * @param {string} params.situation - Situation string (e.g., "1v3")
 * @param {number} params.startTick - When clutch situation began
 * @param {number} params.endTick - When round ended
 * @param {number} params.points - Points based on difficulty
 * @param {Array} params.kills - Kills made during clutch
 * @param {Object} [params.priorities] - Custom priorities
 * @returns {Object} Clutch highlight object
 */
function createClutchHighlight({
  player,
  round,
  situation,
  startTick,
  endTick,
  points,
  kills,
  priorities,
}) {
  return {
    ...createBaseHighlight(HIGHLIGHT_TYPES.CLUTCH, player, points, priorities),
    round,
    situation,
    startTick,
    endTick,
    kills,
  };
}

export {
  createKillSeriesHighlight,
  createCollateralHighlight,
  createKnifeHighlight,
  createClutchHighlight,
};
