/**
 * @fileoverview Analyze Postprocess UI command
 * 
 * Takes highlights.json from analyze-v2 and calculates:
 * - Playback boundaries (with padding and round constraints)
 * - Speed-up segments (for boring periods)
 * - Slow motion triggers (for impressive kills)
 * 
 * Outputs: highlights_postprocess.json
 * 
 * This separation allows re-running postprocess calculations
 * without re-parsing demo files.
 */

import path from 'path';
import fs from 'fs';
import { DEFAULT_CONFIG } from '../config.js';
import { parseJsonFile, ensureDir } from '../validators.js';
import { roundSeconds, secondsToTicks } from '../utils/time.js';

// Import existing calculation modules
import { calculateSpeedupSegments } from '../services/highlightEnricher/speedup.js';
import { calculateSlowmotion } from '../services/highlightEnricher/slowmo.js';

/**
 * Main command handler
 */
async function analyzePostprocessUICommand(options) {
  const highlightsPath = path.resolve(options.highlights);
  const outputPath = path.resolve(options.output);
  
  console.log('[postprocess-ui] Loading highlights from:', highlightsPath);
  
  // Load highlights
  const data = parseJsonFile(highlightsPath, 'Highlights file');
  
  // Check version
  if (data.version !== 2) {
    console.warn('[postprocess-ui] Warning: Expected version 2 highlights. Results may vary.');
  }
  
  // Get config
  const config = data.config || DEFAULT_CONFIG;
  
  // Process all demos
  let totalProcessed = 0;
  
  for (const demo of data.demos) {
    const tickRate = demo.tickRate || 128;
    
    for (let i = 0; i < demo.highlights.length; i++) {
      const highlight = demo.highlights[i];
      
      // Calculate playback boundaries
      const playback = calculatePlaybackBoundariesFromHighlight(
        highlight,
        tickRate,
        config.padding
      );
      
      // Create shotsByPlayer structure for speedup calculation
      const shotsByPlayer = {};
      if (highlight.playerShots && highlight.player.steamId) {
        shotsByPlayer[highlight.player.steamId] = highlight.playerShots;
      }
      
      // Calculate speedup segments
      const speedupSegments = calculateSpeedupSegments(
        highlight,
        playback,
        tickRate,
        shotsByPlayer,
        config.speedup
      );
      
      // Calculate slowmotion
      const slowmotion = calculateSlowmotion(
        highlight,
        playback,
        tickRate,
        config.slowmo
      );
      
      // Update highlight with playback info
      demo.highlights[i] = {
        ...highlight,
        playback: {
          ...playback,
          speedupSegments,
          slowmotion,
        },
      };
      
      totalProcessed++;
    }
  }
  
  // Update metadata
  data.fileType = 'highlights-postprocess';
  data.postprocessedAt = new Date().toISOString();
  
  // Write output
  ensureDir(path.dirname(outputPath));
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  
  console.log(`[postprocess-ui] Processed ${totalProcessed} highlights`);
  console.log(`[postprocess-ui] Output written to: ${outputPath}`);
}

/**
 * Calculate playback boundaries from highlight data
 * 
 * Uses roundStartTick, roundEndTick, nextRoundStartTick stored in highlight
 * instead of requiring full rounds array.
 */
function calculatePlaybackBoundariesFromHighlight(highlight, tickRate, paddingConfig) {
  const paddingBeforeTicks = secondsToTicks(paddingConfig.before, tickRate);
  const paddingAfterTicks = secondsToTicks(paddingConfig.after, tickRate);
  const roundEndBuffer = secondsToTicks(2, tickRate); // 2 seconds after round end
  
  // Get highlight tick range
  const startTick = highlight.tick !== undefined ? highlight.tick : highlight.startTick;
  const endTick = highlight.tick !== undefined ? highlight.tick : highlight.endTick;
  
  // Start: simple padding, capped at 0
  const playbackStartTick = Math.max(0, startTick - paddingBeforeTicks);
  
  // End: start with desired padding
  let playbackEndTick = endTick + paddingAfterTicks;
  
  // Apply round-based caps using stored round info
  
  // Cap 1: Current round end + buffer
  if (highlight.roundEndTick) {
    playbackEndTick = Math.min(playbackEndTick, highlight.roundEndTick + roundEndBuffer);
  }
  
  // Cap 2: NEVER enter next round (highest priority)
  if (highlight.nextRoundStartTick) {
    playbackEndTick = Math.min(playbackEndTick, highlight.nextRoundStartTick);
  }
  
  const durationSeconds = roundSeconds((playbackEndTick - playbackStartTick) / tickRate);
  
  return {
    startTick: playbackStartTick,
    endTick: playbackEndTick,
    durationSeconds,
    paddingBefore: paddingConfig.before,
    paddingAfter: paddingConfig.after,
  };
}

export { analyzePostprocessUICommand };
