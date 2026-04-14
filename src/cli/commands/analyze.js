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
import { Worker } from 'worker_threads';
import os from 'os';
import { fileURLToPath } from 'url';
import { MusicPlaylist, saveMusicMapping, loadMusicMapping, resyncMusicMapping } from '../../music.js';
import { DEFAULT_CONFIG } from '../config.js';
import { validateDirExists, ensureDir, parseJsonFile } from '../validators.js';

const WORKER_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'analyzeWorker.js');

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

  // Process demo files in parallel using worker threads
  const maxWorkers = Math.max(1, os.cpus().length - 1);
  const concurrency = Math.min(maxWorkers, demFiles.length);
  console.log(`Using ${concurrency} worker thread(s)`);

  const tasks = demFiles.map(demoFile => {
    const fileName = path.basename(demoFile);
    return { demoFile, fileName, soloTicks: soloKillsByDemo[fileName] || [] };
  });

  const demoResults = await runPool(tasks, concurrency);

  for (const { result, error, fileName } of demoResults) {
    if (error) {
      console.error(`  Error processing ${fileName}: ${error}`);
    } else {
      results.demos.push(result);
      updateSummary(results.summary, result.highlights);
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
    fileType: 'highlights',
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
 * Run a single demo through a worker thread
 *
 * @param {string} demoFile - Full path to demo file
 * @param {string} fileName - Demo filename
 * @param {number[]} soloTicks - Solo kill ticks
 * @returns {Promise<Object>} Demo result with highlights
 */
function runWorker(demoFile, fileName, soloTicks) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_PATH, {
      workerData: { demoFile, fileName, soloTicks },
    });

    worker.on('message', (msg) => {
      if (msg.type === 'log') {
        console.log(`[${fileName}]${msg.msg}`);
      } else if (msg.type === 'result') {
        worker.terminate();
        resolve(msg.data);
      } else if (msg.type === 'error') {
        worker.terminate();
        reject(new Error(msg.msg));
      }
    });

    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker exited with code ${code}`));
      }
    });
  });
}

/**
 * Run tasks through a pool of workers with limited concurrency
 *
 * @param {Array<{demoFile: string, fileName: string, soloTicks: number[]}>} tasks
 * @param {number} concurrency - Max parallel workers
 * @returns {Promise<Array<{result?: Object, error?: string, fileName: string}>>}
 */
async function runPool(tasks, concurrency) {
  const results = new Array(tasks.length);
  let nextIndex = 0;

  async function pickNext() {
    while (nextIndex < tasks.length) {
      const i = nextIndex++;
      const { demoFile, fileName, soloTicks } = tasks[i];
      console.log(`\nProcessing: ${fileName}`);
      try {
        const result = await runWorker(demoFile, fileName, soloTicks);
        results[i] = { result, fileName };
      } catch (error) {
        results[i] = { error: error.message, fileName };
      }
    }
  }

  const lanes = Array.from({ length: concurrency }, () => pickNext());
  await Promise.all(lanes);

  return results;
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
