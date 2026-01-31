/**
 * @fileoverview Highlight Enrichment Service - Main Entry Point
 * 
 * Transforms raw highlight data from detection into playback-ready highlights.
 * This module orchestrates the enrichment pipeline:
 * 
 * RAW HIGHLIGHT                    ENRICHED HIGHLIGHT
 * ┌──────────────┐                ┌─────────────────────────────┐
 * │ type         │                │ id (unique, stable)         │
 * │ player       │  ──────────►   │ demoFile                    │
 * │ kills[]      │                │ durationSeconds             │
 * │ points       │                │ killGapSum (intensity)      │
 * │ tick/range   │                │ playback {                  │
 * └──────────────┘                │   startTick, endTick        │
 *                                 │   speedupSegments[]         │
 *                                 │   slowmotion { ... }        │
 *                                 │ }                           │
 *                                 └─────────────────────────────┘
 * 
 * ARCHITECTURE:
 * - utils.js    → ID generation, tick range, intensity metrics
 * - playback.js → Playback boundary calculation with round constraints
 * - speedup.js  → Speed-up segment detection for boring periods
 * - slowmo.js   → Slow motion trigger detection for impressive kills
 * 
 * @module highlightEnricher
 */

import { 
  getHighlightTickRange, 
  generateHighlightId, 
  calculateKillGapSum 
} from './utils.js';
import { calculatePlaybackBoundaries } from './playback.js';
import { calculateSpeedupSegments } from './speedup.js';
import { calculateSlowmotion } from './slowmo.js';
import { roundSeconds } from '../../utils/time.js';

/**
 * Enrich a single highlight with playback metadata
 * 
 * This is the main transformation function. It takes raw detection data
 * and adds everything needed to record and process the highlight:
 * - Unique ID for tracking across pipeline stages
 * - Playback boundaries (with padding)
 * - Speed-up segments for action gaps
 * - Slow motion triggers for impressive kills
 * 
 * @param {Object} highlight - Raw highlight from detector
 * @param {Object} demoData - Demo metadata { tickRate, rounds, shotsByPlayer }
 * @param {string} demoFile - Demo filename (for ID generation)
 * @param {Object} config - Configuration { padding, speedup, slowmo }
 * @returns {Object} Enriched highlight ready for recording
 * 
 * @example
 * const enriched = enrichHighlight(rawHighlight, demoData, 'demo.dem', config);
 * // enriched.id => "a1b2c3d4e5f6"
 * // enriched.playback.speedupSegments => [{ startTick, endTick, ... }]
 * // enriched.playback.slowmotion => { tick, reason: 'headshot', ... }
 */
function enrichHighlight(highlight, demoData, demoFile, config) {
  const { tickRate, rounds, shotsByPlayer } = demoData;
  
  // Step 1: Extract tick range (handles different highlight structures)
  const { startTick, endTick } = getHighlightTickRange(highlight);
  
  // Step 2: Generate stable unique ID
  const id = generateHighlightId(demoFile, highlight, startTick, endTick);
  
  // Step 3: Calculate basic metrics
  const durationSeconds = roundSeconds((endTick - startTick) / tickRate);
  const killGapSum = calculateKillGapSum(highlight, tickRate);
  
  // Step 4: Calculate playback boundaries (with round constraints)
  const playback = calculatePlaybackBoundaries(
    startTick,
    endTick,
    tickRate,
    rounds,
    config.padding
  );
  
  // Step 5: Detect speed-up opportunities
  const speedupSegments = calculateSpeedupSegments(
    highlight,
    playback,
    tickRate,
    shotsByPlayer,
    config.speedup
  );
  
  // Step 6: Detect slow motion trigger
  const slowmotion = calculateSlowmotion(
    highlight,
    playback,
    tickRate,
    config.slowmo
  );
  
  // Compose final enriched highlight
  return {
    id,
    ...highlight,
    demoFile,
    durationSeconds,
    killGapSum,
    playback: {
      ...playback,
      speedupSegments,
      slowmotion,
    },
  };
}

/**
 * Enrich all highlights from a demo
 * 
 * Convenience function to process an array of highlights.
 * Each highlight is enriched independently.
 * 
 * @param {Array} highlights - Raw highlights from detector
 * @param {Object} demoData - Demo metadata
 * @param {string} demoFile - Demo filename
 * @param {Object} config - Configuration
 * @returns {Array} Array of enriched highlights
 */
function enrichAllHighlights(highlights, demoData, demoFile, config) {
  return highlights.map(h => enrichHighlight(h, demoData, demoFile, config));
}

// Re-export utilities for external use
export {
  // Main API
  enrichHighlight,
  enrichAllHighlights,
  
  // Utilities (for testing and advanced use)
  getHighlightTickRange,
  generateHighlightId,
  calculateKillGapSum,
  calculatePlaybackBoundaries,
  calculateSpeedupSegments,
  calculateSlowmotion,
};
