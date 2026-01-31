/**
 * @fileoverview Slow motion calculation for impressive kills
 * 
 * Determines when to apply slow motion effect for dramatic impact.
 * Slowmo highlights precision (headshots) and style (noscopes).
 * 
 * TRIGGER CONDITIONS:
 * ─────────────────────────────────────────────────────────────
 * │ Type        │ Condition                                   │
 * ├─────────────┼─────────────────────────────────────────────┤
 * │ one-tap     │ ALWAYS (precision shot by definition)       │
 * │ collateral  │ ALWAYS (impressive multi-kill)              │
 * │ solo        │ If headshot OR noscope                      │
 * │ kill-series │ LAST headshot/noscope kill in series        │
 * │ clutch      │ LAST headshot/noscope kill in series        │
 * │ knife       │ Never (no gun skill involved)               │
 * ─────────────────────────────────────────────────────────────
 * 
 * EFFECT BEHAVIOR:
 * - Instant slowdown at kill moment
 * - Gradual ramp back to normal speed
 * - Cinematic effects (contrast, color grading) fade with slowmo
 */

import { secondsToTicks } from '../../utils/time.js';

/**
 * Highlight types that can receive slowmo effect
 */
const SLOWMO_ELIGIBLE_TYPES = ['kill-series', 'clutch', 'collateral', 'solo', 'one-tap'];

/**
 * Calculate slow motion moment for impressive kills
 * 
 * @param {Object} highlight - Highlight object
 * @param {Object} playback - Playback boundaries { startTick, endTick }
 * @param {number} tickRate - Server tick rate
 * @param {Object} slowmoConfig - Configuration:
 *   - duration: Slowmo effect duration in seconds
 *   - contrast: Peak contrast adjustment
 *   - brightness: Peak brightness adjustment
 *   - redBoost: Peak red color boost
 *   - saturation: Peak saturation adjustment
 * @returns {Object|null} Slow motion data or null if not applicable
 */
function calculateSlowmotion(highlight, playback, tickRate, slowmoConfig) {
  if (!isEligibleForSlowmo(highlight.type)) {
    return null;
  }
  
  const qualifyingKill = findQualifyingKill(highlight);
  if (!qualifyingKill) {
    return null;
  }
  
  return buildSlowmoData(
    qualifyingKill,
    highlight.type,
    playback,
    tickRate,
    slowmoConfig
  );
}

/**
 * Check if highlight type is eligible for slowmo
 * 
 * @param {string} type - Highlight type
 * @returns {boolean} True if eligible
 */
function isEligibleForSlowmo(type) {
  return SLOWMO_ELIGIBLE_TYPES.includes(type);
}

/**
 * Find the kill that qualifies for slowmo
 * 
 * Selection strategy varies by highlight type:
 * - one-tap: The kill IS the highlight (no kills array)
 * - collateral: First kill (all same tick anyway)
 * - solo: The single kill (if headshot/noscope)
 * - series/clutch: LAST headshot/noscope (dramatic finish)
 * 
 * @param {Object} highlight - Highlight object
 * @returns {Object|null} Qualifying kill or null
 */
function findQualifyingKill(highlight) {
  const { type, kills } = highlight;
  
  // One-tap: Always qualifies (it's a precise headshot by definition)
  // Note: one-tap stores tick/weapon on highlight, not in kills array
  if (type === 'one-tap') {
    return {
      tick: highlight.tick,
      weapon: highlight.weapon,
      headshot: true,
      noscope: false,
    };
  }
  
  // All other types need kills array
  if (!kills || kills.length === 0) {
    return null;
  }
  
  // Collateral: Always qualifies (multi-kill is always impressive)
  if (type === 'collateral') {
    return kills[0];
  }
  
  // Solo: Single kill with headshot or noscope
  if (type === 'solo') {
    const kill = kills[0];
    return isImpressiveKill(kill) ? kill : null;
  }
  
  // Series/Clutch: Find the LAST impressive kill
  // This creates the most dramatic slowmo at the finish
  return findLastImpressiveKill(kills);
}

/**
 * Check if a kill is "impressive" (worthy of slowmo)
 * 
 * @param {Object} kill - Kill object
 * @returns {boolean} True if headshot or noscope
 */
function isImpressiveKill(kill) {
  return kill.headshot === true || kill.noscope === true;
}

/**
 * Find the last impressive kill in a series
 * 
 * Searches backwards through kills array to find the last
 * headshot or noscope. This makes the slowmo hit at the
 * climactic finish of a multi-kill sequence.
 * 
 * @param {Array} kills - Kills array
 * @returns {Object|null} Last impressive kill or null
 */
function findLastImpressiveKill(kills) {
  for (let i = kills.length - 1; i >= 0; i--) {
    if (isImpressiveKill(kills[i])) {
      return kills[i];
    }
  }
  return null;
}

/**
 * Determine the reason for slowmo (used in UI/logs)
 * 
 * @param {string} highlightType - Type of highlight
 * @param {Object} kill - The qualifying kill
 * @returns {string} Reason string
 */
function determineSlowmoReason(highlightType, kill) {
  if (highlightType === 'one-tap') return 'one-tap';
  if (highlightType === 'collateral') return 'collateral';
  if (kill.noscope) return 'noscope';
  return 'headshot';
}

/**
 * Build the slowmo data object
 * 
 * @param {Object} qualifyingKill - The kill triggering slowmo
 * @param {string} highlightType - Type of highlight
 * @param {Object} playback - Playback boundaries
 * @param {number} tickRate - Server tick rate
 * @param {Object} config - Slowmo configuration
 * @returns {Object} Slowmo data object
 */
function buildSlowmoData(qualifyingKill, highlightType, playback, tickRate, config) {
  // Slowmo starts AT the kill moment
  const slowmoStartTick = qualifyingKill.tick;
  // And ends after configured duration
  const slowmoEndTick = qualifyingKill.tick + secondsToTicks(config.duration, tickRate);
  
  return {
    tick: qualifyingKill.tick,
    // Clamp to playback boundaries
    startTick: Math.max(slowmoStartTick, playback.startTick),
    endTick: Math.min(slowmoEndTick, playback.endTick),
    durationSeconds: config.duration,
    reason: determineSlowmoReason(highlightType, qualifyingKill),
    weapon: qualifyingKill.weapon,
    // Cinematic effects (peak values, fade out with slowmo)
    contrast: config.contrast,
    brightness: config.brightness,
    redBoost: config.redBoost,
    saturation: config.saturation,
  };
}

export {
  calculateSlowmotion,
  isEligibleForSlowmo,
  findQualifyingKill,
  isImpressiveKill,
};
