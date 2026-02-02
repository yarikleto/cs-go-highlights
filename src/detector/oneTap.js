/**
 * @fileoverview One-Tap kill detection module
 * 
 * Detects "cold" one-tap kills - patient, precise first-shot headshots:
 * 1. Player hasn't shot since round start (waiting for the perfect moment)
 * 2. First bullet is a headshot
 * 3. Player doesn't shoot for ~2 seconds after the kill
 * 
 * Allowed weapons:
 * - Pistols (deagle, glock, usp, p250, etc.)
 * - Rifles (AK-47, M4, FAMAS, Galil, AUG, SG553)
 * - Machine guns (M249, Negev)
 * 
 * Excluded:
 * - All snipers (AWP, Scout, auto-snipers) - scoped headshots expected
 * - Shotguns - close range one-shots are expected
 * - SMGs - spray weapons, not precision
 * - Knives - don't shoot
 */

import { KILL_POINTS, PRIORITIES, DETECTION } from './constants.js';
import { createOneTapHighlight } from './highlightFactory.js';

/**
 * Weapons excluded from one-tap detection
 */
const EXCLUDED_WEAPONS = [
  // All snipers (scoped headshots are expected, not impressive)
  'awp', 'ssg08', 'g3sg1', 'scar20',
  // Shotguns (one-shot at close range is expected)
  'nova', 'xm1014', 'mag7', 'sawedoff',
  // SMGs (spray weapons, not precision)
  'mac10', 'mp9', 'mp7', 'mp5sd', 'ump45', 'p90', 'bizon',
];

/**
 * Check if weapon is allowed for one-tap
 * 
 * @param {string} weapon - Weapon name
 * @returns {boolean} True if weapon can qualify for one tap
 */
function isAllowedWeapon(weapon) {
  if (!weapon) return false;
  const normalized = weapon.toLowerCase().replace('weapon_', '');
  
  // Check if it's an excluded weapon
  if (EXCLUDED_WEAPONS.some(w => normalized.includes(w))) {
    return false;
  }
  
  // Also exclude knife
  if (normalized.includes('knife') || normalized.includes('bayonet')) {
    return false;
  }
  
  return true;
}


/**
 * Find the round that contains a specific tick
 * 
 * @param {Array} rounds - All rounds from demo
 * @param {number} tick - Tick to find round for
 * @returns {Object|null} Round object or null if not found
 */
function findRoundForTick(rounds, tick) {
  for (const round of rounds) {
    if (tick >= round.startTick && (round.endTick === null || tick <= round.endTick)) {
      return round;
    }
  }
  return null;
}

/**
 * Count shots in a time window
 * 
 * @param {Array} shots - Array of shot ticks for the player
 * @param {number} startTick - Start of window (inclusive)
 * @param {number} endTick - End of window (inclusive)
 * @returns {number} Number of shots in window
 */
function countShotsInWindow(shots, startTick, endTick) {
  if (!shots || shots.length === 0) return 0;
  
  let count = 0;
  for (const shotTick of shots) {
    if (shotTick >= startTick && shotTick <= endTick) {
      count++;
    }
  }
  return count;
}

/**
 * Check if a kill qualifies as a cold one-tap
 * 
 * Criteria:
 * 1. Must be a headshot
 * 2. Weapon must be allowed (pistol, rifle, machine gun)
 * 3. Exactly 1 shot from round start until windowAfter seconds after kill
 *    (meaning: first shot of the round was the kill, no follow-up)
 * 
 * @param {Object} kill - Kill event from parser
 * @param {Array} playerShots - All shots by the attacker
 * @param {Array} rounds - All rounds from demo
 * @param {number} tickRate - Server tick rate
 * @param {Object} detection - Detection settings
 * @returns {boolean} True if this is a cold one-tap
 */
function isOneTap(kill, playerShots, rounds, tickRate, detection) {
  // Must be headshot
  if (!kill.headshot) return false;
  
  // Weapon must be allowed (pistols, rifles, machine guns - no snipers)
  if (!isAllowedWeapon(kill.weapon)) return false;
  
  // Find the round for this kill
  const round = findRoundForTick(rounds, kill.tick);
  if (!round) return false;
  
  // Cold criteria: exactly 1 shot from round start to windowAfter after kill
  const { windowAfter } = detection.oneTap;
  const windowEndTick = kill.tick + (windowAfter * tickRate);
  const shotCount = countShotsInWindow(playerShots, round.startTick, windowEndTick);
  
  // Must be exactly 1 shot (the killing shot)
  return shotCount === 1;
}

/**
 * Detect cold one-tap kills from all kills in demo
 * 
 * @param {Array} kills - All kill events from parser
 * @param {Object} shotsByPlayer - Map of steamId -> array of shot ticks
 * @param {Array} rounds - All rounds from demo
 * @param {number} tickRate - Server tick rate
 * @param {Object} [killPoints=KILL_POINTS] - Point configuration
 * @param {Object} [priorities=PRIORITIES] - Priority configuration
 * @param {Object} [detection=DETECTION] - Detection configuration
 * @param {Set} [excludedKillTicks=new Set()] - Kill ticks to exclude
 * @returns {Array} Array of one tap highlight objects
 */
function detectOneTaps(
  kills,
  shotsByPlayer,
  rounds,
  tickRate,
  killPoints = KILL_POINTS,
  priorities = PRIORITIES,
  detection = DETECTION,
  excludedKillTicks = new Set()
) {
  const highlights = [];
  
  for (const kill of kills) {
    // Skip if this kill is already part of another highlight
    if (excludedKillTicks.has(kill.tick)) continue;
    
    const attackerSteamId = kill.attacker.steamId;
    if (!attackerSteamId) continue;
    
    const playerShots = shotsByPlayer[attackerSteamId] || [];
    
    if (isOneTap(kill, playerShots, rounds, tickRate, detection)) {
      const highlight = buildOneTapHighlight(kill, killPoints, priorities);
      highlights.push(highlight);
    }
  }
  
  return highlights;
}

/**
 * Build a one tap highlight from a qualifying kill
 * 
 * @private
 * @param {Object} kill - Kill event
 * @param {Object} killPoints - Point configuration
 * @param {Object} priorities - Priority configuration
 * @returns {Object} One tap highlight object
 */
function buildOneTapHighlight(kill, killPoints, priorities) {
  const basePoints = getBasePoints(kill, killPoints);
  const totalPoints = basePoints + (killPoints.one_tap_bonus || 3);
  
  return createOneTapHighlight({
    player: kill.attacker,
    tick: kill.tick,
    points: totalPoints,
    weapon: kill.weapon,
    weaponCategory: kill.weaponCategory,
    priorities,
  });
}

/**
 * Get base points for the kill based on weapon category
 * 
 * @private
 * @param {Object} kill - Kill event
 * @param {Object} killPoints - Point configuration
 * @returns {number} Base points
 */
function getBasePoints(kill, killPoints) {
  const category = kill.weaponCategory || 'rifle';
  
  switch (category) {
    case 'pistol':
      return killPoints.pistol_headshot || 4;
    case 'machinegun':
      return killPoints.machinegun_headshot || killPoints.rifle_headshot || 5;
    default:
      return killPoints.rifle_headshot || 5;
  }
}

/**
 * Get kill ticks from one tap highlights (for exclusion in other detectors)
 * 
 * @param {Array} oneTapHighlights - Array of one tap highlights
 * @returns {Set} Set of kill ticks
 */
function getOneTapKillTicks(oneTapHighlights) {
  return new Set(oneTapHighlights.map(h => h.tick));
}

export {
  detectOneTaps,
  getOneTapKillTicks,
  isOneTap,
  isAllowedWeapon,
};
