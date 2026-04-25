/**
 * @fileoverview Record command - capture highlights using HLAE
 * 
 * Uses Half-Life Advanced Effects (HLAE) to record demos.
 * Produces raw clips without post-processing effects.
 */

import path from 'path';
import fs from 'fs';
import { recordAllHighlights } from '../../recorder.js';
import { cleanupTempFiles } from '../../merger.js';
import { validateFileExists, validateDirExists, ensureDir, parseJsonFile, getHighlights } from '../validators.js';
import { RECORDING_QUALITY, GAME_VERSION } from '../../config.js';
import {
  readDemoHeader,
  assertVersionCompatibility,
  VersionMismatchError,
  resolveExpectedVersion,
} from '../services/versionCheck.js';

/**
 * Main record command handler
 * 
 * @param {Object} options - Command options
 */
async function recordCommand(options) {
  // Validate all required paths
  const highlightsPath = validateFileExists(options.highlights, 'Highlights file');
  const demosPath = validateDirExists(options.demos, 'Demos folder');
  const hlaePath = validateFileExists(options.hlae, 'HLAE executable');
  const csgoPath = validateDirExists(options.csgo, 'CS:GO folder');
  const outputPath = path.resolve(options.output);
  
  const playerFilter = options.player || null;
  const idFilter = options.id || null;
  const voiceChat = options.voiceChat || false;
  const voiceNoHud = options.voice || false;
  const keepVoice = options.keepVoice || false;
  const force = options.force || false;

  // Validate mutually exclusive options
  if (voiceChat && voiceNoHud) {
    console.error('Error: --voice-chat and --voice are mutually exclusive.');
    console.error('  --voice-chat: records with HUD, chat, and voice (single pass)');
    console.error('  --voice: records voice audio without HUD (double pass)');
    process.exit(1);
  }
  
  // Validate quality preset
  const qualityPreset = options.quality || RECORDING_QUALITY.default;
  const quality = RECORDING_QUALITY[qualityPreset];
  if (!quality) {
    console.error(`Error: Unknown quality preset "${qualityPreset}"`);
    console.error('Available presets: high, medium, fast, draft');
    process.exit(1);
  }

  // Parse highlights
  const highlightsData = parseJsonFile(highlightsPath, 'highlights.json');

  // Version compatibility check (fail fast before HLAE spawn).
  if (options.skipVersionCheck) {
    console.warn('WARNING: --skip-version-check enabled, demo/game version not verified');
  } else {
    const expected = resolveExpectedVersion(options, GAME_VERSION);
    const highlightsList = getHighlights(highlightsData);
    const demoFilesUsed = [...new Set(highlightsList.map(h => h.demoFile))]
      .filter(Boolean)
      .map(name => path.join(demosPath, name))
      .filter(p => fs.existsSync(p));

    const demoHeaders = demoFilesUsed.map(f => readDemoHeader(f));
    try {
      assertVersionCompatibility({ csgoPath, demoHeaders, expected });
    } catch (err) {
      if (err instanceof VersionMismatchError) {
        console.error(err.message);
        console.error('\nUse --skip-version-check to bypass (not recommended).');
        process.exit(1);
      }
      throw err;
    }
  }

  // Count highlights and calculate estimated time (with filters)
  const { count: totalHighlights, estimatedSeconds } = getHighlightStats(highlightsData, playerFilter, idFilter);

  if (totalHighlights === 0) {
    console.error('Error: No highlights found to record');
    if (playerFilter) console.error(`  (filtered by player: ${playerFilter})`);
    if (idFilter) console.error(`  (filtered by ID: ${idFilter})`);
    process.exit(1);
  }

  // Print summary
  printRecordSummary({
    highlightsPath,
    demosPath,
    hlaePath,
    csgoPath,
    outputPath,
    totalHighlights,
    estimatedSeconds,
    qualityPreset,
    quality,
    playerFilter,
    idFilter,
    voiceNoHud,
  });

  // Ensure output directory
  ensureDir(outputPath);

  try {
    // Record all highlights
    const recordedClips = await recordAllHighlights({
      highlightsData,
      demosPath,
      hlaePath,
      csgoPath,
      outputPath,
      quality,
      playerFilter,
      idFilter,
      voiceChat,
      voiceNoHud,
      keepVoice,
      force,
    });

    if (recordedClips.length === 0) {
      console.error('\nError: No clips were recorded successfully');
      process.exit(1);
    }

    // Print completion message
    printRecordCompletion(recordedClips.length, outputPath, highlightsPath);

    // Cleanup temp files
    cleanupTempFiles(outputPath);
  } catch (err) {
    console.error(`\nError during recording: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Get highlight statistics (count and estimated recording time)
 * 
 * @param {Object} highlightsData - Parsed highlights.json
 * @param {string|null} playerFilter - Steam ID filter
 * @param {string|null} idFilter - Highlight ID filter
 * @returns {{ count: number, estimatedSeconds: number }}
 */
function getHighlightStats(highlightsData, playerFilter, idFilter) {
  const highlights = getHighlights(highlightsData);
  
  const filtered = highlights.filter(highlight => {
    const matchesPlayer = !playerFilter || highlight.player?.steamId === playerFilter;
    const matchesId = !idFilter || highlight.id === idFilter;
    return matchesPlayer && matchesId;
  });
  
  // Sum playback durations
  const totalPlaybackSeconds = filtered.reduce((sum, h) => 
    sum + (h.playback?.durationSeconds || h.durationSeconds || 20), 0);
  
  // Count unique demos (each demo load takes ~15 seconds)
  const uniqueDemos = new Set(filtered.map(h => h.demoFile)).size;
  const demoLoadOverhead = uniqueDemos * 15;
  
  return {
    count: filtered.length,
    estimatedSeconds: totalPlaybackSeconds + demoLoadOverhead,
  };
}

/**
 * Print recording summary before starting
 */
function printRecordSummary(params) {
  console.log('CS:GO Highlights Recorder');
  console.log('=========================');
  console.log(`Highlights file: ${params.highlightsPath}`);
  console.log(`Demos folder: ${params.demosPath}`);
  console.log(`HLAE path: ${params.hlaePath}`);
  console.log(`CS:GO path: ${params.csgoPath}`);
  console.log(`Output folder: ${params.outputPath}`);
  console.log(`Quality: ${params.qualityPreset} (CRF ${params.quality.crf}, ${params.quality.preset})`);
  if (params.voiceNoHud) console.log(`Voice mode: double-pass (voice audio without HUD)`);
  console.log(`Total highlights to record: ${params.totalHighlights}`);
  const timeEstimate = params.voiceNoHud ? params.estimatedSeconds * 2 : params.estimatedSeconds;
  console.log(`Estimated time: ~${formatDuration(timeEstimate)}${params.voiceNoHud ? ' (2x for double-pass)' : ''}`);
  if (params.playerFilter) console.log(`Filtering by player: ${params.playerFilter}`);
  if (params.idFilter) console.log(`Filtering by ID: ${params.idFilter}`);
}

/**
 * Format seconds into human-readable duration
 * 
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted string (e.g., "5 min 30 sec" or "1 hr 15 min")
 */
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours} hr ${minutes} min`;
  } else if (minutes > 0) {
    return `${minutes} min ${secs} sec`;
  } else {
    return `${secs} sec`;
  }
}

/**
 * Print completion message with next steps
 */
function printRecordCompletion(clipCount, outputPath, highlightsPath) {
  const clipsDir = path.join(outputPath, 'clips');
  
  console.log('\n=========================');
  console.log('Recording Complete!');
  console.log('=========================');
  console.log(`Recorded ${clipCount} raw clips`);
  console.log(`Clips saved to: ${clipsDir}`);
  console.log('\nNext steps:');
  console.log(`  1. Post-process UI: node src/index.js postprocess-ui --highlights "${highlightsPath}" --clips "${clipsDir}"`);
  console.log(`  2. Merge clips: node src/index.js merge --clips "${clipsDir}"`);
}

export { recordCommand };
