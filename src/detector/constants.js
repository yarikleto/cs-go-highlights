/**
 * @fileoverview Constants for highlight detection system
 * 
 * This module contains all configuration constants used across detection modules.
 * Centralizing constants ensures consistency and makes tuning easier.
 */

/**
 * Highlight type identifiers
 * Using constants prevents typos and enables IDE autocomplete
 */
const HIGHLIGHT_TYPES = Object.freeze({
  SOLO: 'solo',
  CLUTCH: 'clutch',
  KNIFE: 'knife',
  COLLATERAL: 'collateral',
  KILL_SERIES: 'kill-series',
});

/**
 * Priority levels for highlights (used for collision resolution)
 * Higher priority wins when highlights overlap in time
 * 
 * Example: If a knife kill occurs during a kill-series,
 * the kill-series (priority 5) takes precedence over knife (priority 3)
 */
const PRIORITIES = Object.freeze({
  [HIGHLIGHT_TYPES.SOLO]: 1,        // Lowest - single kills added manually
  [HIGHLIGHT_TYPES.CLUTCH]: 2,
  [HIGHLIGHT_TYPES.KNIFE]: 3,
  [HIGHLIGHT_TYPES.COLLATERAL]: 4,
  [HIGHLIGHT_TYPES.KILL_SERIES]: 5, // Highest - multi-kills are most impressive
});

/**
 * Weapon categories for point calculation
 */
const WEAPON_CATEGORIES = Object.freeze({
  PISTOL: 'pistol',
  RIFLE: 'rifle',
  SNIPER: 'sniper',
});

/**
 * Point values for different kill types
 * 
 * Scoring philosophy (from lowest to highest):
 * - Body shots < Headshots (skill)
 * - Pistols < Rifles < Snipers (difficulty)
 * - Scoped < Noscope (style)
 * - Gun kills < Knife kills (humiliation factor)
 */
const KILL_POINTS = Object.freeze({
  pistol_body: 1,
  rifle_body: 2,
  sniper_body: 3,
  pistol_headshot: 4,
  rifle_headshot: 5,
  sniper_headshot: 6,
  sniper_noscope: 7,  // Noscope shots require exceptional skill
  knife: 8,           // Knife kills are always impressive - high risk, high reward
});

/**
 * Clutch difficulty multiplier for point calculation
 * Points = enemies * CLUTCH_POINTS_MULTIPLIER
 */
const CLUTCH_POINTS_MULTIPLIER = 10;

module.exports = {
  HIGHLIGHT_TYPES,
  PRIORITIES,
  WEAPON_CATEGORIES,
  KILL_POINTS,
  CLUTCH_POINTS_MULTIPLIER,
};
