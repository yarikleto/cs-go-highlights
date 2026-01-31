/**
 * @fileoverview Main highlight detection orchestrator
 * 
 * This module coordinates all highlight detection types and serves as the
 * public API for the detector subsystem. It follows the Facade pattern to
 * hide complexity from consumers.
 * 
 * Detection order matters for some highlight types to avoid duplicates:
 * 1. Kill Series (detected first to identify knife kills in series)
 * 2. Collaterals (independent)
 * 3. Knife Kills (excludes knives already in series)
 * 4. Clutches (independent, uses round data)
 */

const { KILL_POINTS, PRIORITIES, HIGHLIGHT_TYPES } = require('./constants');
const { calculateKillPoints } = require('./utils');
const { detectKillSeries, getKnifeKillsInSeries } = require('./killSeries');
const { detectCollaterals } = require('./collateral');
const { detectKnifeKills } = require('./knife');
const { detectClutches } = require('./clutch');

/**
 * Detect all highlights from parsed demo data
 * 
 * This is the main entry point for highlight detection.
 * It coordinates multiple specialized detectors and handles
 * cross-detector dependencies (like knife kills in series).
 * 
 * @param {Object} demoData - Parsed demo data from parser module
 * @param {number} demoData.tickRate - Server tick rate (64/128)
 * @param {Array} demoData.kills - All kill events
 * @param {Array} demoData.rounds - All round data
 * @param {Object} config - Detection configuration
 * @param {Object} [config.detection] - Detection parameters
 * @param {number} config.detection.maxDelay - Max seconds between kills for series
 * @param {number} config.detection.minSeriesKills - Min kills for series highlight
 * @param {number} config.detection.minEnemies - Min enemies for clutch highlight
 * @param {Object} [config.killPoints] - Point values (uses defaults if not provided)
 * @param {Object} [config.priorities] - Priority values (uses defaults if not provided)
 * @returns {Array} Array of highlight objects (mixed types)
 * 
 * @example
 * const highlights = detectHighlights(demoData, {
 *   detection: { maxDelay: 5, minSeriesKills: 3, minEnemies: 2 },
 *   killPoints: KILL_POINTS,  // or custom values
 *   priorities: PRIORITIES,   // or custom values
 * });
 */
function detectHighlights(demoData, config) {
  const { tickRate, kills, rounds } = demoData;
  
  // Extract config with backward compatibility
  // Supports both flat config and nested config structure
  const detection = extractDetectionConfig(config);
  const killPoints = config.killPoints || KILL_POINTS;
  const priorities = config.priorities || PRIORITIES;

  // Convert time-based config to tick-based for internal use
  const maxDelayTicks = detection.maxDelay * tickRate;

  const highlights = [];

  // Step 1: Detect kill series first (needed for knife exclusion)
  const killSeriesHighlights = detectKillSeries(
    kills, 
    maxDelayTicks, 
    detection.minSeriesKills, 
    killPoints, 
    priorities
  );
  highlights.push(...killSeriesHighlights);

  // Step 2: Identify knife kills already in series (to avoid duplicates)
  const knifeKillsInSeries = getKnifeKillsInSeries(kills, killSeriesHighlights);

  // Step 3: Detect collaterals (independent of other types)
  const collateralHighlights = detectCollaterals(kills, killPoints, priorities);
  highlights.push(...collateralHighlights);

  // Step 4: Detect knife kills (excluding those in series)
  const knifeHighlights = detectKnifeKills(
    kills, 
    killPoints, 
    priorities, 
    knifeKillsInSeries
  );
  highlights.push(...knifeHighlights);

  // Step 5: Detect clutches (uses round data, independent)
  const clutchHighlights = detectClutches(rounds, detection.minEnemies, priorities);
  highlights.push(...clutchHighlights);

  return highlights;
}

/**
 * Extract detection config with backward compatibility
 * 
 * Supports two config formats:
 * - New format: { detection: { maxDelay, minSeriesKills, minEnemies }, ... }
 * - Old format: { maxDelay, minSeriesKills, minEnemies, ... } (flat)
 * 
 * @private
 * @param {Object} config - Configuration object
 * @returns {Object} Detection parameters
 */
function extractDetectionConfig(config) {
  return config.detection || config;
}

// Re-export individual detectors for advanced usage and testing
module.exports = {
  // Main API
  detectHighlights,
  
  // Individual detectors (for fine-grained control)
  detectKillSeries,
  detectCollaterals,
  detectKnifeKills,
  detectClutches,
  
  // Utilities
  calculateKillPoints,
  
  // Constants (for external configuration)
  PRIORITIES,
  KILL_POINTS,
  HIGHLIGHT_TYPES,
};
