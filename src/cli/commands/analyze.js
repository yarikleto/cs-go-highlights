/**
 * @fileoverview Analyze command - detect highlights from demo files
 * 
 * This is the first step in the pipeline:
 * 1. Parse demo files to extract game events
 * 2. Detect highlights (kill series, clutches, etc.)
 * 3. Resolve collisions between overlapping highlights
 * 4. Enrich highlights with playback metadata
 * 5. Generate music mapping (if music folder exists)
 * 6. Output highlights.json
 */

import path from 'path';
import fs from 'fs';
import { parseDemo } from '../../parser.js';
import { detectHighlights } from '../../detector.js';
import { resolveCollisions } from '../../resolver.js';
import { MusicPlaylist, saveMusicMapping, loadMusicMapping, resyncMusicMapping } from '../../music.js';
import { DEFAULT_CONFIG } from '../config.js';
import { validateDirExists, ensureDir, parseJsonFile } from '../validators.js';
import { enrichAllHighlights } from '../services/highlightEnricher.js';

/**
 * Main analyze command handler
 * 
 * @param {Object} options - Command options from commander
 * @param {string} options.demos - Path to demos folder
 * @param {string} options.output - Output folder path
 * @param {boolean} options.resetMusic - Reset music mapping offsets
 * @param {string} options.soloKillsFile - Path to solo kills JSON file
 */
async function analyzeCommand(options) {
  const demosPath = validateDirExists(options.demos, 'Demos folder');
  const outputPath = path.resolve(options.output);
  const resetMusic = options.resetMusic || false;
  
  // Load solo kills if provided
  const soloKillsByDemo = loadSoloKills(options.soloKillsFile);
  
  // Find demo files
  const demFiles = findDemoFiles(demosPath);
  
  console.log(`Found ${demFiles.length} demo file(s)`);
  console.log('Config:', DEFAULT_CONFIG.detection);

  // Initialize results structure
  const results = createResultsStructure();

  // Process each demo file
  for (const demoFile of demFiles) {
    const fileName = path.basename(demoFile);
    console.log(`\nProcessing: ${fileName}`);

    try {
      const demoResult = await processSingleDemo(
        demoFile, 
        fileName, 
        soloKillsByDemo[fileName] || []
      );
      
      results.demos.push(demoResult);
      updateSummary(results.summary, demoResult.highlights);
    } catch (error) {
      console.error(`  Error processing ${fileName}: ${error.message}`);
    }
  }

  // Write output
  ensureDir(outputPath);
  writeHighlightsJson(outputPath, results);
  
  // Generate music mapping
  await generateMusicMapping(outputPath, results, resetMusic);
}

/**
 * Load solo kills from JSON file
 * Format: {"demo.dem": [tick1, tick2], ...}
 * 
 * @param {string|undefined} filePath - Path to solo kills file
 * @returns {Object} Map of demo filename to tick arrays
 */
function loadSoloKills(filePath) {
  if (!filePath) return {};
  
  const soloKillsPath = path.resolve(filePath);
  if (!fs.existsSync(soloKillsPath)) {
    console.error(`Error: Solo kills file not found: ${soloKillsPath}`);
    process.exit(1);
  }
  
  try {
    const content = fs.readFileSync(soloKillsPath, 'utf8');
    const soloKillsByDemo = JSON.parse(content);
    const totalTicks = Object.values(soloKillsByDemo).flat().length;
    console.log(`Solo kills loaded: ${totalTicks} tick(s) across ${Object.keys(soloKillsByDemo).length} demo(s)`);
    return soloKillsByDemo;
  } catch (e) {
    console.error(`Error parsing solo kills file: ${e.message}`);
    process.exit(1);
  }
}

/**
 * Find all .dem files in directory
 * 
 * @param {string} demosPath - Path to demos folder
 * @returns {string[]} Array of full file paths
 */
function findDemoFiles(demosPath) {
  const files = fs.readdirSync(demosPath)
    .filter(file => file.endsWith('.dem'))
    .map(file => path.join(demosPath, file));
    
  if (files.length === 0) {
    console.error(`Error: No .dem files found in: ${demosPath}`);
    process.exit(1);
  }
  
  return files;
}

/**
 * Create initial results structure
 * 
 * @returns {Object} Empty results object
 */
function createResultsStructure() {
  return {
    generatedAt: new Date().toISOString(),
    config: DEFAULT_CONFIG,
    demos: [],
    summary: {
      totalHighlights: 0,
      totalDurationSeconds: 0,
      byType: {
        'solo': 0,
        'one-tap': 0,
        'kill-series': 0,
        'collateral': 0,
        'knife': 0,
        'clutch': 0,
      },
    },
  };
}

/**
 * Process a single demo file
 * 
 * @param {string} demoFile - Full path to demo file
 * @param {string} fileName - Demo filename
 * @param {number[]} soloTicks - Ticks for solo kill highlights
 * @returns {Object} Demo result with highlights
 */
async function processSingleDemo(demoFile, fileName, soloTicks) {
  // Parse demo
  const demoData = await parseDemo(demoFile);
  console.log(`  Tick rate: ${demoData.tickRate}`);
  console.log(`  Total kills: ${demoData.kills.length}`);
  console.log(`  Total rounds: ${demoData.rounds.length}`);

  // Detect highlights
  let highlights = detectHighlights(demoData, DEFAULT_CONFIG);
  console.log(`  Raw highlights found: ${highlights.length}`);

  // Add solo kill highlights
  const soloHighlights = createSoloHighlights(demoData, soloTicks);
  if (soloHighlights.length > 0) {
    highlights.push(...soloHighlights);
    console.log(`  Added ${soloHighlights.length} solo kill highlight(s)`);
  }

  // Resolve collisions
  highlights = resolveCollisions(highlights);
  console.log(`  After collision resolution: ${highlights.length}`);

  // Enrich with playback metadata
  highlights = enrichAllHighlights(highlights, demoData, fileName, DEFAULT_CONFIG);

  return {
    file: fileName,
    tickRate: demoData.tickRate,
    highlights,
  };
}

/**
 * Create solo kill highlights from specified ticks
 * 
 * Solo highlights are manually-specified single kills worth featuring.
 * 
 * @param {Object} demoData - Parsed demo data
 * @param {number[]} soloTicks - Ticks to create highlights for
 * @returns {Array} Solo highlight objects
 */
function createSoloHighlights(demoData, soloTicks) {
  const highlights = [];
  const soloPriority = DEFAULT_CONFIG.priorities['solo'] || 1;
  
  for (const tick of soloTicks) {
    const kill = demoData.kills.find(k => k.tick === tick);
    if (!kill) {
      console.log(`  Warning: No kill found at tick ${tick}`);
      continue;
    }
    
    // Calculate points
    const points = (kill.headshot ? (DEFAULT_CONFIG.killPoints?.headshot || 2) : (DEFAULT_CONFIG.killPoints?.normal || 1)) +
                  (kill.noscope ? (DEFAULT_CONFIG.killPoints?.noscope || 3) : 0);
    
    highlights.push({
      type: 'solo',
      priority: soloPriority,
      player: {
        name: kill.attacker.name,
        steamId: kill.attacker.steamId,
      },
      tick: kill.tick,
      kills: [kill],
      points,
    });
  }
  
  return highlights;
}

/**
 * Update summary with highlights from a demo
 * 
 * @param {Object} summary - Summary object to update
 * @param {Array} highlights - Highlights to count
 */
function updateSummary(summary, highlights) {
  summary.totalHighlights += highlights.length;
  
  for (const h of highlights) {
    summary.byType[h.type]++;
    summary.totalDurationSeconds += h.playback.durationSeconds;
  }
  
  summary.totalDurationSeconds = Math.round(summary.totalDurationSeconds * 100) / 100;
}

/**
 * Write highlights.json to output folder
 * 
 * @param {string} outputPath - Output folder path
 * @param {Object} results - Results to write
 */
function writeHighlightsJson(outputPath, results) {
  const outputFile = path.join(outputPath, 'highlights.json');
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(`\nResults written to: ${outputFile}`);
  console.log(`Total highlights: ${results.summary.totalHighlights}`);
  console.log('By type:', results.summary.byType);
}

/**
 * Generate music mapping for highlights
 * 
 * @param {string} outputPath - Output folder path
 * @param {Object} results - Analysis results
 * @param {boolean} resetMusic - Whether to reset existing offsets
 */
async function generateMusicMapping(outputPath, results, resetMusic) {
  const musicFolder = path.resolve(DEFAULT_CONFIG.music.folder);
  
  if (!fs.existsSync(musicFolder)) {
    console.log(`\nNote: Music folder not found (${musicFolder}). Skipping music mapping.`);
    console.log('  Create a "music" folder with audio files to enable music overlay.');
    return;
  }
  
  console.log('\n--- Music Mapping ---');
  
  try {
    const playlist = new MusicPlaylist(musicFolder);
    await playlist.analyze();
    
    // Collect all highlights
    const allHighlights = [];
    let commonTickRate = 128;
    
    for (const demo of results.demos) {
      if (demo.highlights) {
        commonTickRate = demo.tickRate || 128;
        allHighlights.push(...demo.highlights);
      }
    }
    
    if (allHighlights.length === 0) {
      console.log('  No highlights to map music to');
      return;
    }
    
    const musicMappingFile = path.join(outputPath, 'music-mapping.json');
    
    // Load existing offsets (unless reset)
    const { existingOffsets, existingOverrides } = loadExistingMusicOffsets(
      musicMappingFile, 
      resetMusic
    );
    
    // Generate new mapping
    let musicMapping = playlist.generateMapping(allHighlights, commonTickRate);
    
    // Restore preserved offsets and overrides
    const hasOffsets = restoreOffsets(musicMapping, existingOffsets, existingOverrides);
    
    // Recalculate times if offsets were restored
    if (hasOffsets) {
      console.log('  Recalculating music times with preserved offsets...');
      musicMapping = resyncMusicMapping(musicMapping);
    }
    
    saveMusicMapping(musicMappingFile, musicMapping);
    console.log(`  Music mapping written to: ${musicMappingFile}`);
    console.log(`  Mapped ${Object.keys(musicMapping.clips).length} clips to music`);
    
    if (resetMusic) {
      console.log('  Offsets reset (--reset-music flag used)');
    } else {
      console.log(`  Tip: Add "offset" field to any clip to shift its music timing, then run 'resync-music'`);
    }
  } catch (error) {
    console.error(`  Music mapping error: ${error.message}`);
    console.log('  Continuing without music mapping...');
  }
}

/**
 * Load existing music offsets from previous mapping
 * 
 * @param {string} mappingFile - Path to existing mapping file
 * @param {boolean} reset - Whether to ignore existing values
 * @returns {Object} Existing offsets and overrides
 */
function loadExistingMusicOffsets(mappingFile, reset) {
  const existingOffsets = {};
  const existingOverrides = {};
  
  if (reset || !fs.existsSync(mappingFile)) {
    return { existingOffsets, existingOverrides };
  }
  
  try {
    const existingMapping = loadMusicMapping(mappingFile);
    if (existingMapping && existingMapping.clips) {
      for (const [clipId, clipData] of Object.entries(existingMapping.clips)) {
        if (clipData.offset && clipData.offset !== 0) {
          existingOffsets[clipId] = clipData.offset;
        }
        if (clipData.overrideStartTime) {
          existingOverrides[clipId] = clipData.overrideStartTime;
        }
      }
      
      if (Object.keys(existingOffsets).length > 0) {
        console.log(`  Preserving ${Object.keys(existingOffsets).length} existing offset(s)`);
      }
      if (Object.keys(existingOverrides).length > 0) {
        console.log(`  Preserving ${Object.keys(existingOverrides).length} existing overrideStartTime(s)`);
      }
    }
  } catch (e) {
    // Ignore errors loading existing mapping
  }
  
  return { existingOffsets, existingOverrides };
}

/**
 * Restore preserved offsets and overrides to new mapping
 * 
 * @param {Object} mapping - New music mapping
 * @param {Object} offsets - Preserved offsets
 * @param {Object} overrides - Preserved overrides
 * @returns {boolean} Whether any offsets were restored
 */
function restoreOffsets(mapping, offsets, overrides) {
  let hasOffsets = false;
  
  for (const [clipId, offset] of Object.entries(offsets)) {
    if (mapping.clips[clipId]) {
      mapping.clips[clipId].offset = offset;
      hasOffsets = true;
    }
  }
  
  for (const [clipId, override] of Object.entries(overrides)) {
    if (mapping.clips[clipId]) {
      mapping.clips[clipId].overrideStartTime = override;
    }
  }
  
  return hasOffsets;
}

export { analyzeCommand };
