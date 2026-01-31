/**
 * @fileoverview Kill series detection module
 * 
 * Detects consecutive kills by a single player within a time window.
 * This is typically the most impressive type of highlight (multi-kills).
 * 
 * Qualification criteria (any of):
 * - Meets minimum kill threshold (default: 3)
 * - 2+ kills containing a knife kill (style bonus)
 * - 2+ headshots with special weapons (deagle/sniper/shotgun = skill)
 */

import { KILL_POINTS, PRIORITIES } from './constants.js';
import { groupBy, calculateTotalPoints } from './utils.js';
import { createKillSeriesHighlight } from './highlightFactory.js';

/**
 * Detect kill series from all kills in demo
 * 
 * Algorithm:
 * 1. Group kills by attacker
 * 2. Sort each player's kills by tick (chronological)
 * 3. Find consecutive kills within maxDelayTicks
 * 4. Check qualification criteria for each potential series
 * 
 * @param {Array} kills - All kill events from parser
 * @param {number} maxDelayTicks - Maximum ticks between kills to be considered a series
 * @param {number} minSeriesKills - Minimum kills for a regular series to qualify
 * @param {Object} [killPoints=KILL_POINTS] - Point configuration
 * @param {Object} [priorities=PRIORITIES] - Priority configuration
 * @returns {Array} Array of kill-series highlight objects
 */
function detectKillSeries(kills, maxDelayTicks, minSeriesKills, killPoints = KILL_POINTS, priorities = PRIORITIES) {
  const highlights = [];
  
  // Group kills by attacker for individual series detection
  const killsByAttacker = groupBy(kills, kill => kill.attacker.name);

  // Process each player's kills independently
  for (const [, attackerKills] of killsByAttacker) {
    const playerSeries = findSeriesForPlayer(attackerKills, maxDelayTicks);
    
    for (const seriesKills of playerSeries) {
      // Check if this series qualifies as a highlight
      if (!isQualifyingSeries(seriesKills, minSeriesKills)) {
        continue;
      }
      
      const highlight = buildSeriesHighlight(seriesKills, killPoints, priorities);
      highlights.push(highlight);
    }
  }

  return highlights;
}

/**
 * Find all kill series for a single player
 * 
 * Series boundaries are determined by:
 * - Time gap exceeding maxDelayTicks
 * - Round change (kills in different rounds can't be same series)
 * 
 * @private
 * @param {Array} playerKills - All kills by one player
 * @param {number} maxDelayTicks - Max gap between kills
 * @returns {Array<Array>} Array of kill arrays (each inner array is a potential series)
 */
function findSeriesForPlayer(playerKills, maxDelayTicks) {
  if (playerKills.length === 0) return [];
  
  // Sort chronologically - essential for detecting consecutive kills
  const sortedKills = [...playerKills].sort((a, b) => a.tick - b.tick);
  
  const allSeries = [];
  let currentSeries = [sortedKills[0]];
  
  for (let i = 1; i < sortedKills.length; i++) {
    const prevKill = sortedKills[i - 1];
    const currentKill = sortedKills[i];
    
    const shouldBreakSeries = isSeriesBreak(prevKill, currentKill, maxDelayTicks);
    
    if (shouldBreakSeries) {
      // End current series and start new one
      allSeries.push(currentSeries);
      currentSeries = [currentKill];
    } else {
      // Continue current series
      currentSeries.push(currentKill);
    }
  }
  
  // Don't forget the last series
  allSeries.push(currentSeries);
  
  return allSeries;
}

/**
 * Determine if a series should break between two kills
 * 
 * @private
 * @param {Object} prevKill - Previous kill in sequence
 * @param {Object} currentKill - Current kill being evaluated
 * @param {number} maxDelayTicks - Maximum allowed gap
 * @returns {boolean} True if series should break here
 */
function isSeriesBreak(prevKill, currentKill, maxDelayTicks) {
  // Time gap too long - player lost momentum
  const tooMuchTime = currentKill.tick - prevKill.tick > maxDelayTicks;
  
  // Round changed - can't continue series across rounds
  const roundChanged = currentKill.round !== prevKill.round;
  
  return tooMuchTime || roundChanged;
}

/**
 * Check if a kill sequence qualifies as a highlight-worthy series
 * 
 * Qualification rules (OR logic - any satisfied = qualifies):
 * 1. Standard: meets minimum kill count
 * 2. Knife bonus: 2+ kills with at least one knife (humiliation)
 * 3. Skill shots: 2+ headshots with difficult weapons
 * 
 * @private
 * @param {Array} seriesKills - Kills in the potential series
 * @param {number} minSeriesKills - Minimum for standard qualification
 * @returns {boolean} True if series qualifies as highlight
 */
function isQualifyingSeries(seriesKills, minSeriesKills) {
  const count = seriesKills.length;
  
  // Rule 1: Standard threshold
  if (count >= minSeriesKills) {
    return true;
  }
  
  // Rules 2 & 3 require at least 2 kills
  if (count < 2) {
    return false;
  }
  
  // Rule 2: Contains knife kill (high style points)
  const containsKnife = seriesKills.some(k => k.isKnife);
  if (containsKnife) {
    return true;
  }
  
  // Rule 3: All headshots with special weapons (deagle/sniper/shotgun)
  // These weapons are harder to hit headshots with, so 2 in a row is impressive
  const allHeadshotsWithSpecialWeapon = seriesKills.every(
    k => k.headshot && k.isHeadshotSeriesWeapon
  );
  if (allHeadshotsWithSpecialWeapon) {
    return true;
  }
  
  return false;
}

/**
 * Build a highlight object from a qualified series
 * 
 * @private
 * @param {Array} seriesKills - Kills in the series
 * @param {Object} killPoints - Point configuration
 * @param {Object} priorities - Priority configuration
 * @returns {Object} Kill series highlight object
 */
function buildSeriesHighlight(seriesKills, killPoints, priorities) {
  const firstKill = seriesKills[0];
  const lastKill = seriesKills[seriesKills.length - 1];
  
  // Extract relevant data for each kill in the series
  const killsData = seriesKills.map(k => ({
    tick: k.tick,
    weapon: k.weapon,
    headshot: k.headshot,
    noscope: k.noscope || false,
    firstShotTick: k.firstShotTick || null, // When player started shooting (for timing)
  }));
  
  const containsKnife = seriesKills.some(k => k.isKnife);
  const allHeadshotsWithSpecialWeapon = seriesKills.every(
    k => k.headshot && k.isHeadshotSeriesWeapon
  );
  
  return createKillSeriesHighlight({
    player: firstKill.attacker,
    startTick: firstKill.tick,
    endTick: lastKill.tick,
    killCount: seriesKills.length,
    points: calculateTotalPoints(seriesKills, killPoints),
    kills: killsData,
    containsKnife,
    allHeadshotsWithSpecialWeapon,
    priorities,
  });
}

/**
 * Find knife kills that are part of any series
 * Used to prevent duplicate highlights (knife in series shouldn't also create knife highlight)
 * 
 * @param {Array} kills - All kills from demo
 * @param {Array} seriesHighlights - Detected kill series highlights
 * @returns {Set<string>} Set of "playerId_tick" keys for knife kills in series
 */
function getKnifeKillsInSeries(kills, seriesHighlights) {
  const knifeKillsInSeries = new Set();
  
  for (const series of seriesHighlights) {
    if (!series.containsKnife) continue;
    
    const playerKey = series.player.steamId || series.player.name;
    
    // Find original kills that match series kills and are knife kills
    for (const seriesKill of series.kills) {
      const originalKill = kills.find(k => 
        k.tick === seriesKill.tick && 
        (k.attacker.steamId || k.attacker.name) === playerKey &&
        k.isKnife
      );
      
      if (originalKill) {
        knifeKillsInSeries.add(`${playerKey}_${seriesKill.tick}`);
      }
    }
  }
  
  return knifeKillsInSeries;
}

/**
 * Get all kill ticks that are part of any series
 * Used to exclude these kills from other detectors (e.g., one taps)
 * 
 * @param {Array} seriesHighlights - Detected kill series highlights
 * @returns {Set<number>} Set of kill ticks in series
 */
function getKillTicksInSeries(seriesHighlights) {
  const killTicks = new Set();
  
  for (const series of seriesHighlights) {
    for (const kill of series.kills) {
      killTicks.add(kill.tick);
    }
  }
  
  return killTicks;
}

export {
  detectKillSeries,
  getKnifeKillsInSeries,
  getKillTicksInSeries,
};
