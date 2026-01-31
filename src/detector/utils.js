/**
 * @fileoverview Shared utilities for highlight detection
 * 
 * Contains helper functions used across multiple detector modules.
 * Following DRY principle - common logic extracted here.
 */

import { KILL_POINTS, WEAPON_CATEGORIES } from './constants.js';

/**
 * Calculate points for a single kill based on weapon type and shot placement
 * 
 * Point calculation priority:
 * 1. Knife kills (always highest for guns)
 * 2. Sniper noscope (exceptional skill)
 * 3. Category + headshot/body combination
 * 
 * @param {Object} kill - Kill event object from parser
 * @param {boolean} kill.isKnife - Whether kill was with a knife
 * @param {string} kill.weaponCategory - 'pistol', 'rifle', or 'sniper'
 * @param {boolean} kill.noscope - Whether sniper shot was noscope
 * @param {boolean} kill.headshot - Whether kill was a headshot
 * @param {Object} [killPoints=KILL_POINTS] - Custom point values (for config override)
 * @returns {number} Points value for this kill
 */
function calculateKillPoints(kill, killPoints = KILL_POINTS) {
  // Knife is a special case - always use knife points
  if (kill.isKnife) {
    return killPoints.knife ?? KILL_POINTS.knife;
  }

  const category = kill.weaponCategory || WEAPON_CATEGORIES.RIFLE;
  
  // Sniper noscope is the most impressive gun kill
  if (category === WEAPON_CATEGORIES.SNIPER && kill.noscope) {
    return killPoints.sniper_noscope ?? KILL_POINTS.sniper_noscope;
  }

  // Build lookup key: "{category}_{headshot|body}"
  const modifier = kill.headshot ? 'headshot' : 'body';
  const key = `${category}_${modifier}`;
  
  // Fallback to rifle_body if unknown combination (defensive programming)
  return killPoints[key] ?? KILL_POINTS[key] ?? KILL_POINTS.rifle_body;
}

/**
 * Group array items by a key extracted from each item
 * 
 * Generic grouping utility - follows Open/Closed principle
 * Can be extended for any grouping need without modification
 * 
 * @template T
 * @param {T[]} items - Array of items to group
 * @param {(item: T) => string} keyExtractor - Function to extract grouping key
 * @returns {Map<string, T[]>} Map of key -> items with that key
 * 
 * @example
 * // Group kills by attacker name
 * const byAttacker = groupBy(kills, kill => kill.attacker.name);
 */
function groupBy(items, keyExtractor) {
  const groups = new Map();
  
  for (const item of items) {
    const key = keyExtractor(item);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(item);
  }
  
  return groups;
}

/**
 * Create a unique identifier for a player
 * Prefers steamId (globally unique) but falls back to name
 * 
 * @param {Object} player - Player object
 * @param {string} [player.steamId] - Steam ID (preferred)
 * @param {string} player.name - Player name (fallback)
 * @returns {string} Unique player identifier
 */
function getPlayerId(player) {
  return player.steamId || player.name;
}

/**
 * Create a composite key for attacker + tick combination
 * Used to identify specific kill events uniquely
 * 
 * @param {Object} kill - Kill event
 * @returns {string} Unique key for this kill event
 */
function getKillKey(kill) {
  const playerId = getPlayerId(kill.attacker);
  return `${playerId}_${kill.tick}`;
}

/**
 * Calculate total points for an array of kills
 * 
 * @param {Object[]} kills - Array of kill events
 * @param {Object} [killPoints=KILL_POINTS] - Point configuration
 * @returns {number} Sum of points for all kills
 */
function calculateTotalPoints(kills, killPoints = KILL_POINTS) {
  return kills.reduce((sum, kill) => sum + calculateKillPoints(kill, killPoints), 0);
}

export {
  calculateKillPoints,
  calculateTotalPoints,
  groupBy,
  getPlayerId,
  getKillKey,
};
