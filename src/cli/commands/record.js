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
import { validateFileExists, validateDirExists, ensureDir, parseJsonFile } from '../validators.js';

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

  // Parse highlights
  const highlightsData = parseJsonFile(highlightsPath, 'highlights.json');

  // Count highlights (with filters)
  const totalHighlights = countHighlights(highlightsData, playerFilter, idFilter);

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
    playerFilter,
    idFilter,
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
      playerFilter,
      idFilter,
      voiceChat,
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
 * Count highlights matching filters
 * 
 * @param {Object} highlightsData - Parsed highlights.json
 * @param {string|null} playerFilter - Steam ID filter
 * @param {string|null} idFilter - Highlight ID filter
 * @returns {number} Count of matching highlights
 */
function countHighlights(highlightsData, playerFilter, idFilter) {
  let count = 0;
  
  for (const demo of highlightsData.demos) {
    for (const highlight of demo.highlights) {
      const matchesPlayer = !playerFilter || highlight.player.steamId === playerFilter;
      const matchesId = !idFilter || highlight.id === idFilter;
      if (matchesPlayer && matchesId) {
        count++;
      }
    }
  }
  
  return count;
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
  console.log(`Total highlights to record: ${params.totalHighlights}`);
  if (params.playerFilter) console.log(`Filtering by player: ${params.playerFilter}`);
  if (params.idFilter) console.log(`Filtering by ID: ${params.idFilter}`);
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
