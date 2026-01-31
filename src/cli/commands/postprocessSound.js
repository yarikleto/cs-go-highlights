/**
 * @fileoverview Post-process sound command - apply music to clips
 * 
 * Applies background music to processed clips:
 * - Uses music mapping from analyze step
 * - Supports manual offset adjustments
 * - Fades music in/out
 * 
 * Separate from UI postprocess to allow fast music iteration.
 */

const path = require('path');
const fs = require('fs');
const { applyMusicToVideo } = require('../../recorder');
const { loadMusicMapping } = require('../../music');
const { DEFAULT_CONFIG } = require('../config');
const { 
  validateFileExists, 
  validateDirExists, 
  ensureDir, 
  parseJsonFile,
  buildHighlightMap,
  sortClipFiles,
  extractHighlightId,
} = require('../validators');

/**
 * Main postprocess-sound command handler
 * 
 * @param {Object} options - Command options
 */
async function postprocessSoundCommand(options) {
  const highlightsPath = validateFileExists(options.highlights, 'Highlights file');
  const clipsPath = validateDirExists(options.clips, 'Clips folder');
  const outputPath = options.output 
    ? path.resolve(options.output) 
    : path.join(path.dirname(clipsPath), 'clips_final');
    
  const forceReprocess = options.force || false;
  const filterById = options.id || null;
  
  // Music options
  const musicFolder = options.music 
    ? path.resolve(options.music) 
    : path.resolve(DEFAULT_CONFIG.music.folder);
  const musicVolume = options.musicVolume !== undefined 
    ? options.musicVolume / 100 
    : DEFAULT_CONFIG.music.volume;

  ensureDir(outputPath);

  // Parse highlights
  const highlightsData = parseJsonFile(highlightsPath, 'highlights.json');
  const highlightMap = buildHighlightMap(highlightsData);

  // Load music mapping
  const musicMapping = loadMusicMappingOrExit(highlightsPath, musicFolder);

  // Find clip files
  const clipFiles = findClipFiles(clipsPath);

  // Load processing status
  const { statusPath, musicStatus } = loadMusicStatus(outputPath);

  // Print summary
  printSummary({
    clipsPath,
    outputPath,
    clipCount: clipFiles.length,
    mappedCount: Object.keys(musicMapping.clips).length,
    musicVolume,
    forceReprocess,
    filterById,
  });

  // Apply music to clips
  const { processed, skipped } = await applyMusicToClips({
    clipFiles,
    clipsPath,
    outputPath,
    highlightMap,
    musicMapping,
    musicStatus,
    statusPath,
    musicVolume,
    forceReprocess,
    filterById,
  });

  // Final status save
  fs.writeFileSync(statusPath, JSON.stringify(musicStatus, null, 2));

  // Print completion
  printCompletion(processed, skipped, outputPath, statusPath, clipsPath);
}

/**
 * Load music mapping or exit with error
 * 
 * @param {string} highlightsPath - Path to highlights.json
 * @param {string} musicFolder - Path to music folder
 * @returns {Object} Music mapping
 */
function loadMusicMappingOrExit(highlightsPath, musicFolder) {
  if (!fs.existsSync(musicFolder)) {
    console.error('Error: Music folder not found. Cannot apply music.');
    process.exit(1);
  }
  
  const musicMappingPath = path.join(path.dirname(highlightsPath), 'music-mapping.json');
  
  if (!fs.existsSync(musicMappingPath)) {
    console.error('Error: Music mapping not found. Run analyze first.');
    process.exit(1);
  }
  
  const mapping = loadMusicMapping(musicMappingPath);
  if (!mapping) {
    console.error('Error: Failed to load music mapping.');
    process.exit(1);
  }
  
  return mapping;
}

/**
 * Find and sort clip files
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
 * Load existing music application status
 */
function loadMusicStatus(outputPath) {
  const statusPath = path.join(outputPath, 'music-status.json');
  let musicStatus = {};
  
  if (fs.existsSync(statusPath)) {
    try {
      musicStatus = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    } catch (e) {
      musicStatus = {};
    }
  }
  
  return { statusPath, musicStatus };
}

/**
 * Print processing summary
 */
function printSummary(params) {
  console.log('CS:GO Highlights Music Applier');
  console.log('==============================');
  console.log(`Source clips: ${params.clipsPath}`);
  console.log(`Output folder: ${params.outputPath}`);
  console.log(`Total clips: ${params.clipCount}`);
  console.log(`Music mapped: ${params.mappedCount} clips`);
  console.log(`Music volume: ${Math.round(params.musicVolume * 100)}%`);
  if (params.forceReprocess) console.log('Force: re-applying music to all clips');
  if (params.filterById) console.log(`Filter: applying only to ID ${params.filterById}`);
}

/**
 * Apply music to all clips
 * 
 * @returns {{ processed: number, skipped: number }}
 */
async function applyMusicToClips(params) {
  const {
    clipFiles,
    clipsPath,
    outputPath,
    highlightMap,
    musicMapping,
    musicStatus,
    statusPath,
    musicVolume,
    forceReprocess,
    filterById,
  } = params;
  
  let processed = 0;
  let skipped = 0;

  for (const clipFile of clipFiles) {
    const highlightId = extractHighlightId(clipFile);
    if (!highlightId) continue;

    // Apply ID filter
    if (filterById && highlightId !== filterById) continue;

    const highlight = highlightMap[highlightId];
    if (!highlight) {
      console.log(`  Warning: No highlight data for ${clipFile}, skipping`);
      continue;
    }

    // Get music info
    const musicInfo = musicMapping.clips[highlightId];
    if (!musicInfo) {
      console.log(`  Warning: No music mapping for ${highlightId}, skipping`);
      skipped++;
      continue;
    }

    // Check if already processed
    const effectiveStartTime = musicInfo.overrideStartTime || musicInfo.startTime;
    const settingsHash = `music:${effectiveStartTime}:${musicInfo.endTime}:${musicVolume}`;
    
    const sourceClipPath = path.join(clipsPath, clipFile);
    const outputClipPath = path.join(outputPath, clipFile);
    
    if (!forceReprocess && musicStatus[highlightId] === settingsHash && fs.existsSync(outputClipPath)) {
      skipped++;
      continue;
    }

    console.log(`  Applying music to ${clipFile}...`);
    console.log(`    Music: ${musicInfo.trackFilename} (${effectiveStartTime} - ${musicInfo.endTime})`);

    try {
      // Copy source to output
      console.log('    Copying to output folder...');
      fs.copyFileSync(sourceClipPath, outputClipPath);
      
      await applyMusicToVideo({
        inputPath: outputClipPath,
        musicPath: musicInfo.track,
        musicStartTime: effectiveStartTime,
        musicEndTime: musicInfo.endTime,
        musicVolume: musicVolume,
        gameVolume: DEFAULT_CONFIG.music.gameVolume,
        fadeDuration: DEFAULT_CONFIG.music.fadeDuration,
        slowmoSegments: [],
        speedupSegments: [],
        crf: 18,
      });

      // Mark as processed
      musicStatus[highlightId] = settingsHash;
      fs.writeFileSync(statusPath, JSON.stringify(musicStatus, null, 2));
      processed++;
      console.log('    Done!');
    } catch (err) {
      console.error(`    Error: ${err.message}`);
    }
  }

  return { processed, skipped };
}

/**
 * Print completion message
 */
function printCompletion(processed, skipped, outputPath, statusPath, clipsPath) {
  console.log('\n==============================');
  console.log('Music Application Complete!');
  console.log('==============================');
  console.log(`Processed: ${processed} clips`);
  console.log(`Skipped: ${skipped} clips`);
  console.log(`Output folder: ${outputPath}`);
  console.log(`Status saved to: ${statusPath}`);
  console.log(`\nProcessed clips preserved in: ${clipsPath}`);
  console.log('\nTo merge clips into a single video, run:');
  console.log(`  node src/index.js merge --clips "${outputPath}"`);
}

module.exports = { postprocessSoundCommand };
