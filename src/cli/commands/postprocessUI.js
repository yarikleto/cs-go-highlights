/**
 * @fileoverview Post-process UI command - apply visual effects
 * 
 * Applies effects to raw recorded clips:
 * - Speed-up for idle periods (clutches/series)
 * - Slow motion on impressive kills
 * - Player info overlay (name, highlight type)
 * 
 * Original clips are preserved; processed copies are created.
 */

import path from 'path';
import fs from 'fs';
import { postprocessClip } from '../../recorder.js';
import { DEFAULT_CONFIG } from '../config.js';
import { 
  validateFileExists, 
  validateDirExists, 
  ensureDir, 
  parseJsonFile,
  buildHighlightMap,
  sortClipFiles,
  extractHighlightId,
} from '../validators.js';

/**
 * Main postprocess-ui command handler
 * 
 * @param {Object} options - Command options
 */
async function postprocessUICommand(options) {
  const highlightsPath = validateFileExists(options.highlights, 'Highlights file');
  const clipsPath = validateDirExists(options.clips, 'Clips folder');
  const outputPath = options.output 
    ? path.resolve(options.output) 
    : path.join(path.dirname(clipsPath), 'clips_processed');
    
  // Effect options (with defaults)
  const speedupMultiplier = options.speedup || DEFAULT_CONFIG.postprocess.speedupMultiplier;
  const showOverlay = options.overlay || DEFAULT_CONFIG.postprocess.showOverlay;
  const slowmoFactor = options.slowmo || DEFAULT_CONFIG.postprocess.slowmoFactor;
  const forceReprocess = options.force || false;
  const filterById = options.id || null;

  ensureDir(outputPath);

  // Parse highlights
  const highlightsData = parseJsonFile(highlightsPath, 'highlights.json');
  const highlightMap = buildHighlightMap(highlightsData);

  // Load processing status (to skip already processed)
  const { statusPath, processedStatus } = loadProcessingStatus(outputPath);

  // Find clip files
  const clipFiles = findClipFiles(clipsPath);

  // Print summary
  printProcessingSummary({
    clipsPath,
    outputPath,
    clipCount: clipFiles.length,
    speedupMultiplier,
    showOverlay,
    slowmoFactor,
    forceReprocess,
    filterById,
  });

  // Process clips
  const { processed, skipped } = await processClips({
    clipFiles,
    clipsPath,
    outputPath,
    highlightMap,
    processedStatus,
    statusPath,
    speedupMultiplier,
    showOverlay,
    slowmoFactor,
    forceReprocess,
    filterById,
  });

  // Final status save
  fs.writeFileSync(statusPath, JSON.stringify(processedStatus, null, 2));

  // Print completion
  printCompletion(processed, skipped, outputPath, statusPath, clipsPath, highlightsPath);
}

/**
 * Load existing processing status
 * 
 * @param {string} outputPath - Output folder path
 * @returns {Object} Status path and status object
 */
function loadProcessingStatus(outputPath) {
  const statusPath = path.join(outputPath, 'postprocess-status.json');
  let processedStatus = {};
  
  if (fs.existsSync(statusPath)) {
    try {
      processedStatus = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    } catch (e) {
      processedStatus = {};
    }
  }
  
  return { statusPath, processedStatus };
}

/**
 * Find and sort clip files
 * 
 * @param {string} clipsPath - Path to clips folder
 * @returns {string[]} Sorted clip filenames
 */
function findClipFiles(clipsPath) {
  const files = fs.readdirSync(clipsPath)
    .filter(f => f.endsWith('.mp4'));
    
  if (files.length === 0) {
    console.error('Error: No clip files found in folder');
    process.exit(1);
  }
  
  return sortClipFiles(files);
}

/**
 * Print processing summary
 */
function printProcessingSummary(params) {
  console.log('CS:GO Highlights Post-Processor');
  console.log('================================');
  console.log(`Source clips: ${params.clipsPath}`);
  console.log(`Output folder: ${params.outputPath}`);
  console.log(`Total clips: ${params.clipCount}`);
  if (params.speedupMultiplier) console.log(`Speedup: ${params.speedupMultiplier}x`);
  if (params.showOverlay) console.log('Overlay: enabled');
  if (params.slowmoFactor) console.log(`Slowmo: ${params.slowmoFactor}x`);
  if (params.forceReprocess) console.log('Force: re-processing all clips');
  if (params.filterById) console.log(`Filter: processing only ID ${params.filterById}`);
}

/**
 * Process all clips
 * 
 * @param {Object} params - Processing parameters
 * @returns {{ processed: number, skipped: number }}
 */
async function processClips(params) {
  const {
    clipFiles,
    clipsPath,
    outputPath,
    highlightMap,
    processedStatus,
    statusPath,
    speedupMultiplier,
    showOverlay,
    slowmoFactor,
    forceReprocess,
    filterById,
  } = params;
  
  let processed = 0;
  let skipped = 0;

  for (const clipFile of clipFiles) {
    const highlightId = extractHighlightId(clipFile);
    
    if (!highlightId) {
      console.log(`  Skipping ${clipFile} (can't extract highlight ID)`);
      skipped++;
      continue;
    }

    // Apply ID filter
    if (filterById && highlightId !== filterById) {
      continue;
    }

    const highlight = highlightMap[highlightId];
    if (!highlight) {
      console.log(`  Skipping ${clipFile} (highlight ID not found in highlights.json)`);
      skipped++;
      continue;
    }

    // Check if already processed (same settings)
    const settingsHash = JSON.stringify({
      speedup: speedupMultiplier,
      overlay: showOverlay,
      slowmo: slowmoFactor,
    });

    const outputClipPath = path.join(outputPath, clipFile);
    
    if (processedStatus[highlightId] === settingsHash && fs.existsSync(outputClipPath) && !forceReprocess) {
      console.log(`  Skipping ${clipFile} (already processed)`);
      skipped++;
      continue;
    }

    // Process the clip
    const sourceClipPath = path.join(clipsPath, clipFile);
    console.log(`\n  Processing ${clipFile}...`);

    try {
      // Copy source to output (preserve original)
      console.log('    Copying to output folder...');
      fs.copyFileSync(sourceClipPath, outputClipPath);
      
      await postprocessClip({
        clipPath: outputClipPath,
        highlight,
        speedupMultiplier,
        showOverlay,
        slowmoFactor,
      });

      // Mark as processed (save immediately for interrupt safety)
      processedStatus[highlightId] = settingsHash;
      fs.writeFileSync(statusPath, JSON.stringify(processedStatus, null, 2));
      processed++;
      console.log('    Done!');
    } catch (err) {
      console.error(`    Error: ${err.message}`);
      // Remove failed output file
      try {
        if (fs.existsSync(outputClipPath)) fs.unlinkSync(outputClipPath);
      } catch (e) { /* ignore */ }
    }
  }

  return { processed, skipped };
}

/**
 * Print completion message
 */
function printCompletion(processed, skipped, outputPath, statusPath, clipsPath, highlightsPath) {
  console.log('\n================================');
  console.log('Post-Processing Complete!');
  console.log('================================');
  console.log(`Processed: ${processed} clips`);
  console.log(`Skipped: ${skipped} clips`);
  console.log(`Output folder: ${outputPath}`);
  console.log(`Status saved to: ${statusPath}`);
  console.log(`\nOriginal clips preserved in: ${clipsPath}`);
  console.log('\nTo apply music to processed clips, run:');
  console.log(`  node src/index.js postprocess-sound --highlights "${highlightsPath}" --clips "${outputPath}"`);
  console.log('\nTo merge processed clips into a single video, run:');
  console.log(`  node src/index.js merge --clips "${outputPath}"`);
}

export { postprocessUICommand };
