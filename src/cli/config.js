/**
 * @fileoverview Default configuration for the highlight generation pipeline
 * 
 * This module centralizes all configuration constants used across CLI commands.
 * Values are tuned for optimal CS:GO/CS2 highlight generation.
 * 
 * Configuration Sections:
 * - padding: Time buffer around highlights
 * - speedup: Fast-forward settings for idle periods
 * - slowmo: Slow motion effect parameters
 * - music: Audio overlay settings
 * - postprocess: Video processing defaults
 * - detection: Highlight detection thresholds
 * - killPoints: Scoring for different kill types
 * - priorities: Highlight type priority for collision resolution
 */

/**
 * Default configuration object
 * Can be overridden by user config files
 */
const DEFAULT_CONFIG = Object.freeze({
  /**
   * Padding settings (in seconds)
   * Controls how much context is shown before/after the highlight action
   */
  padding: {
    before: 4,  // Seconds before highlight starts (shows approach/setup)
    after: 5,   // Seconds after highlight ends (shows aftermath/reactions)
  },
  
  /**
   * Speed-up settings for clutches and kill-series
   * During long highlights, idle periods (no action) are sped up
   */
  speedup: {
    startDelay: 2,          // Seconds after highlight start before speedup can begin
    bufferAroundKills: 2,   // Seconds to keep at normal speed before/after each kill
    minGapDuration: 4,      // Minimum gap duration (seconds) to trigger speed-up
  },
  
  /**
   * Slow motion settings for impressive kills
   * Applied on headshots/noscopes with visual effects that fade out
   * 
   * Effect timeline: kill moment (peak effects) -> gradual fade to normal
   */
  slowmo: {
    duration: 1,        // Seconds for the slowmo ramp-up effect
    contrast: 1.2,      // Peak contrast (1.0 = normal, higher = more dramatic)
    brightness: 0.1,    // Peak brightness boost (0 = none)
    redBoost: 0.2,      // Warm/red shift in midtones (cinematic look)
    saturation: 1.1,    // Slight saturation boost (1.0 = normal)
  },
  
  /**
   * Music overlay settings
   * Background music is applied to each clip independently
   */
  music: {
    folder: './music',    // Path to folder with music tracks
    volume: 0.6,          // Music volume (0-1, relative to game audio)
    gameVolume: 1.0,      // Game audio volume (0-1)
    fadeDuration: 2,      // Fade in/out duration in seconds
  },
  
  /**
   * Post-processing defaults
   * Applied during the postprocess-ui step
   */
  postprocess: {
    speedupMultiplier: 3,   // Speed multiplier for idle periods (e.g., 3x speed)
    showOverlay: true,      // Show player info overlay
    slowmoFactor: 0.6,      // Slow motion factor (0.5 = half speed)
  },
  
  /**
   * Detection settings
   * Thresholds for what qualifies as a highlight
   */
  detection: {
    maxDelay: 15,           // Max seconds between kills for series
    minSeriesKills: 3,      // Minimum kills for regular series (2-kill with knife always qualifies)
    minEnemies: 2,          // Minimum enemies for clutch (1vX where X >= minEnemies)
  },
  
  /**
   * Kill points (scoring system)
   * Higher points = more impressive kill
   * Used for sorting and collision resolution
   * 
   * Philosophy: difficulty + style = points
   * - Headshots > body shots (precision)
   * - Snipers > rifles > pistols (difficulty)
   * - Noscope > scoped (style)
   * - Knife = highest (risk/humiliation)
   */
  killPoints: {
    pistol_body: 1,
    rifle_body: 2,
    sniper_body: 3,
    pistol_headshot: 4,
    rifle_headshot: 5,
    sniper_headshot: 6,
    sniper_noscope: 7,
    knife: 8,
  },
  
  /**
   * Highlight priorities
   * Used for collision resolution when highlights overlap
   * Higher priority wins
   */
  priorities: {
    'solo': 1,        // Lowest - single kills added manually
    'clutch': 2,
    'knife': 3,
    'collateral': 4,
    'kill-series': 5, // Highest - multi-kills are most impressive
  },
});

/**
 * Highlight type constants
 * Use these instead of string literals for type safety
 */
const HIGHLIGHT_TYPES = Object.freeze({
  SOLO: 'solo',
  CLUTCH: 'clutch',
  KNIFE: 'knife',
  COLLATERAL: 'collateral',
  KILL_SERIES: 'kill-series',
});

/**
 * Deep merge two config objects
 * User config values override defaults
 * 
 * @param {Object} defaults - Default configuration
 * @param {Object} overrides - User overrides
 * @returns {Object} Merged configuration
 */
function mergeConfig(defaults, overrides) {
  const result = { ...defaults };
  
  for (const key of Object.keys(overrides)) {
    if (
      overrides[key] !== null &&
      typeof overrides[key] === 'object' &&
      !Array.isArray(overrides[key]) &&
      defaults[key] !== null &&
      typeof defaults[key] === 'object'
    ) {
      // Recursive merge for nested objects
      result[key] = mergeConfig(defaults[key], overrides[key]);
    } else {
      result[key] = overrides[key];
    }
  }
  
  return result;
}

module.exports = {
  DEFAULT_CONFIG,
  HIGHLIGHT_TYPES,
  mergeConfig,
};
