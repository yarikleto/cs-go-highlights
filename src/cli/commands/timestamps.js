/**
 * @fileoverview Timestamps command
 * 
 * Generates a list of highlight timestamps (after speedup/slowmo effects)
 * with highlight type, map name, and player name.
 * 
 * Useful for:
 * - Creating video chapter markers
 * - Quick reference for highlight positions in final video
 * - Debugging timing issues
 */

import fs from 'fs';
import path from 'path';
import { parseJsonFile, getHighlights } from '../validators.js';
import { DETECTION } from '../../config.js';

/**
 * Extract map name from demo filename
 * 
 * Demo filename format examples:
 * - "auto0-20260130-172652-680432482-de_mirage-WIX_CSGO_CLUB_1.dem"
 * - "match-de_dust2-team1-vs-team2.dem"
 * 
 * @param {string} demoFile - Demo filename
 * @returns {string} Map name (e.g., "de_mirage") or "unknown"
 */
function extractMapName(demoFile) {
  const match = demoFile.match(/(de_[a-z0-9_]+|cs_[a-z0-9_]+|ar_[a-z0-9_]+)/i);
  return match ? match[1].toLowerCase() : 'unknown';
}

/**
 * Calculate final duration of a highlight after all effects are applied
 * 
 * Timeline transformations:
 * 1. Slowmo EXPANDS time: 1 second of slowmo at 0.6x becomes 1/0.6 = 1.67 seconds
 * 2. Speedup COMPRESSES time: 10 seconds at 3x becomes 10/3 = 3.33 seconds
 * 
 * @param {Object} highlight - Highlight object with playback data
 * @param {number} speedupMultiplier - Speedup factor (e.g., 3 for 3x speed)
 * @param {number} slowmoFactor - Slowmo factor (e.g., 0.6 for 60% speed)
 * @returns {number} Final duration in seconds
 */
function calculateFinalDuration(highlight, speedupMultiplier, slowmoFactor) {
  const playback = highlight.playback;
  if (!playback) {
    return highlight.durationSeconds || 0;
  }

  let duration = playback.durationSeconds;

  // Slowmo EXPANDS duration
  // Original slowmo duration becomes (duration / slowmoFactor)
  // Extra time added = originalDuration * (1/slowmoFactor - 1)
  if (playback.slowmotion && slowmoFactor && slowmoFactor < 1) {
    const slowmoDuration = playback.slowmotion.durationSeconds || 1;
    const expansion = slowmoDuration * (1 / slowmoFactor - 1);
    duration += expansion;
  }

  // Speedup COMPRESSES duration
  // Each segment's duration becomes (duration / speedupMultiplier)
  // Time saved = originalDuration * (1 - 1/speedupMultiplier)
  if (playback.speedupSegments && speedupMultiplier && speedupMultiplier > 1) {
    for (const segment of playback.speedupSegments) {
      const segmentDuration = segment.durationSeconds;
      const compression = segmentDuration * (1 - 1 / speedupMultiplier);
      duration -= compression;
    }
  }

  return Math.max(0, duration);
}

/**
 * Format seconds into HH:MM:SS string
 * 
 * @param {number} totalSeconds - Time in seconds
 * @returns {string} Formatted time string
 */
function formatTimestamp(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Format highlight type with kill count or situation info
 * 
 * Examples:
 * - kill-series with 3 kills -> "3K"
 * - kill-series with 4 kills -> "4K"
 * - kill-series with 5 kills -> "ACE"
 * - clutch 1v3 -> "1v3"
 * - knife -> "knife"
 * - collateral with 2 kills -> "collateral 2K"
 * 
 * @param {Object} highlight - Highlight object
 * @returns {string} Formatted type string
 */
function formatHighlightType(highlight) {
  const type = highlight.type || 'unknown';

  switch (type) {
    case 'kill-series': {
      const killCount = highlight.killCount || highlight.kills?.length || 0;
      if (killCount >= DETECTION.aceKillCount) return 'ACE';
      return `${killCount}K`;
    }
    case 'clutch': {
      const situation = highlight.situation || '1vX';
      return situation;
    }
    case 'one-tap': {
      // Show weapon category for one taps (e.g., "one-tap deagle", "one-tap AK")
      const weapon = highlight.weapon || '';
      const shortWeapon = weapon.replace('weapon_', '').replace('_', '-');
      return `one-tap ${shortWeapon}`;
    }
    case 'collateral': {
      const killCount = highlight.killCount || highlight.kills?.length || 2;
      return `collateral ${killCount}K`;
    }
    default:
      return type;
  }
}

/**
 * Main timestamps command handler
 * 
 * @param {Object} options - Command options from commander
 */
async function timestampsCommand(options) {
  const highlightsPath = path.resolve(options.highlights);
  const outputPath = path.resolve(options.output);
  const speedupMultiplier = options.speedup;
  const slowmoFactor = options.slowmo;

  console.log('\n=== Generate Timestamps ===\n');
  console.log(`Highlights: ${highlightsPath}`);
  console.log(`Output: ${outputPath}`);
  console.log(`Speedup: ${speedupMultiplier}x`);
  console.log(`Slowmo: ${slowmoFactor}x`);

  // Parse highlights.json (supports both old and new formats)
  const highlightsData = parseJsonFile(highlightsPath, 'highlights.json');
  const allHighlights = getHighlights(highlightsData);

  if (allHighlights.length === 0) {
    console.log('\nNo highlights found.');
    return;
  }

  console.log(`\nProcessing ${allHighlights.length} highlights...\n`);

  // Calculate timestamps
  const lines = [];
  let cumulativeTime = 0;

  for (const highlight of allHighlights) {
    const mapName = extractMapName(highlight.demoFile);
    const playerName = highlight.player?.name || 'Unknown';
    const highlightType = formatHighlightType(highlight);
    const timestamp = formatTimestamp(cumulativeTime);

    // Format line: timestamp | type | map | player
    const line = `${timestamp} | ${highlightType} | ${mapName} | ${playerName}`;
    lines.push(line);

    // Calculate duration and advance cumulative time
    const duration = calculateFinalDuration(highlight, speedupMultiplier, slowmoFactor);
    cumulativeTime += duration;
  }

  // Write output file
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const content = lines.join('\n');
  fs.writeFileSync(outputPath, content, 'utf-8');

  // Print summary
  console.log('Generated timestamps:\n');
  console.log(content);
  console.log(`\n---`);
  console.log(`Total highlights: ${allHighlights.length}`);
  console.log(`Total duration: ${formatTimestamp(cumulativeTime)}`);
  console.log(`\nTimestamps saved to: ${outputPath}`);
}

export { timestampsCommand };
