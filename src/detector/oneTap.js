/**
 * @fileoverview One Tap kill detection module
 * 
 * Detects "one tap" kills - precise single-shot headshots where the player
 * didn't spray or burst fire. A true one tap means:
 * - Headshot kill
 * - Only ONE shot was fired in a window around the kill
 * - No other shots ~2 seconds before or ~1 second after
 * 
 * This distinguishes intentional precision shots from lucky spray headshots.
 * 
 * Weapons that can one tap:
 * - Pistols (deagle, revolver one taps are iconic)
 * - Rifles (AK-47, M4A1-S one taps are skill shots)
 * - Scout (SSG08) - scout headshots require skill, not guaranteed kill
 * 
 * Excluded:
 * - Shotguns (designed to one-shot at close range)
 * - Knives (don't shoot)
 * - SMGs (spray weapons, not precision)
 * - AWP, SCAR-20, G3SG1 (one-shot kills are expected)
 */

import { KILL_POINTS, PRIORITIES, DETECTION } from './constants.js';
import { createOneTapHighlight } from './highlightFactory.js';

/**
 * Weapons excluded from one tap detection
 * Shotguns and SMGs are not precision weapons
 */
const EXCLUDED_WEAPONS = [
  // Shotguns
  'nova', 'xm1014', 'mag7', 'sawedoff',
  // SMGs (spray weapons)
  'mac10', 'mp9', 'mp7', 'mp5sd', 'ump45', 'p90', 'bizon',
  // Machine guns
  'm249', 'negev',
];

/**
 * Sniper weapons excluded from one-tap detection
 * AWP/auto-snipers one-shot kills are expected, not impressive
 * Scout (SSG08) is NOT excluded - scout headshots require skill
 */
const EXCLUDED_SNIPERS = [
  'awp', 'g3sg1', 'scar20',
];

/**
 * Check if weapon can one tap (not excluded)
 * 
 * @param {string} weapon - Weapon name
 * @returns {boolean} True if weapon can qualify for one tap
 */
function canOneTap(weapon) {
  if (!weapon) return false;
  const normalized = weapon.toLowerCase().replace('weapon_', '');
  return !EXCLUDED_WEAPONS.some(w => normalized.includes(w));
}

/**
 * Check if weapon is an excluded sniper (AWP, auto-snipers)
 * Scout (SSG08) is NOT excluded - scout headshots are impressive
 * 
 * @param {string} weapon - Weapon name
 * @returns {boolean} True if weapon is an excluded sniper
 */
function isExcludedSniper(weapon) {
  if (!weapon) return false;
  const normalized = weapon.toLowerCase().replace('weapon_', '');
  return EXCLUDED_SNIPERS.some(w => normalized.includes(w));
}

/**
 * Count shots in a time window around a specific tick
 * 
 * @param {Array} shots - Array of shot ticks for the player
 * @param {number} killTick - Tick when the kill occurred
 * @param {number} tickRate - Server tick rate
 * @param {number} windowBefore - Seconds before kill to check
 * @param {number} windowAfter - Seconds after kill to check
 * @returns {number} Number of shots in the window
 */
function countShotsInWindow(shots, killTick, tickRate, windowBefore, windowAfter) {
  if (!shots || shots.length === 0) return 0;
  
  const windowStartTick = killTick - (windowBefore * tickRate);
  const windowEndTick = killTick + (windowAfter * tickRate);
  
  let count = 0;
  for (const shotTick of shots) {
    if (shotTick >= windowStartTick && shotTick <= windowEndTick) {
      count++;
    }
  }
  
  return count;
}

/**
 * Check if a kill qualifies as a one tap
 * 
 * Criteria:
 * 1. Must be a headshot
 * 2. Weapon must not be excluded (shotguns, SMGs)
 * 3. Must not be a knife kill
 * 4. If sniper - must be noscope (regular sniper headshots are expected)
 * 5. Only 1 shot in the detection window
 * 
 * @param {Object} kill - Kill event from parser
 * @param {Array} playerShots - All shots by the attacker
 * @param {number} tickRate - Server tick rate
 * @param {Object} detection - Detection settings
 * @returns {boolean} True if this is a one tap
 */
function isOneTap(kill, playerShots, tickRate, detection) {
  // Must be headshot
  if (!kill.headshot) return false;
  
  // Knife kills are not one taps
  if (kill.isKnife) return false;
  
  // Check weapon is not excluded (shotguns, SMGs, etc.)
  if (!canOneTap(kill.weapon)) return false;
  
  // AWP and auto-snipers are excluded (one-shot kills are expected)
  // Scout (SSG08) is allowed - scout headshots require skill
  if (isExcludedSniper(kill.weapon)) return false;
  
  // Count shots in window
  const { windowBefore, windowAfter } = detection.oneTap;
  const shotCount = countShotsInWindow(
    playerShots,
    kill.tick,
    tickRate,
    windowBefore,
    windowAfter
  );
  
  // One tap = exactly 1 shot in the window
  return shotCount === 1;
}

/**
 * Detect one tap kills from all kills in demo
 * 
 * @param {Array} kills - All kill events from parser
 * @param {Object} shotsByPlayer - Map of steamId -> array of shot ticks
 * @param {number} tickRate - Server tick rate
 * @param {Object} [killPoints=KILL_POINTS] - Point configuration
 * @param {Object} [priorities=PRIORITIES] - Priority configuration
 * @param {Object} [detection=DETECTION] - Detection configuration
 * @param {Set} [excludedKillTicks=new Set()] - Kill ticks to exclude (e.g., already in kill series)
 * @returns {Array} Array of one tap highlight objects
 */
function detectOneTaps(
  kills,
  shotsByPlayer,
  tickRate,
  killPoints = KILL_POINTS,
  priorities = PRIORITIES,
  detection = DETECTION,
  excludedKillTicks = new Set()
) {
  const highlights = [];
  
  for (const kill of kills) {
    // Skip if this kill is already part of another highlight (e.g., kill series)
    if (excludedKillTicks.has(kill.tick)) continue;
    
    const attackerSteamId = kill.attacker.steamId;
    if (!attackerSteamId) continue;
    
    const playerShots = shotsByPlayer[attackerSteamId] || [];
    
    if (isOneTap(kill, playerShots, tickRate, detection)) {
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
  // Calculate points based on weapon category + one tap bonus
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
  
  // All one taps are headshots, so use headshot points
  switch (category) {
    case 'pistol':
      return killPoints.pistol_headshot || 4;
    case 'sniper':
      return kill.noscope 
        ? (killPoints.sniper_noscope || 7)
        : (killPoints.sniper_headshot || 6);
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
  canOneTap,
};
