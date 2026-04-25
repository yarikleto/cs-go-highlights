/**
 * @fileoverview Analyze V2 command - detect highlights without points calculation
 * 
 * This is a simplified version of analyze that:
 * 1. Parse demo files to extract game events (with new metadata: flick, airborne)
 * 2. Detect highlights (kill series, clutches, etc.) WITHOUT points
 * 3. Resolve collisions using only priority + killCount
 * 4. Enrich highlights with playback metadata
 * 5. Output highlights.json with raw data
 * 
 * Points/scoring logic is NOT included - that's for the ranking command
 */

import path from 'path';
import fs from 'fs';
import { parseDemo } from '../../parser.js';
import { detectHighlightsV2 } from '../../detectorV2.js';
import { resolveCollisionsV2 } from '../../resolverV2.js';
// Note: Music mapping removed from V2 - use separate command if needed
import { DEFAULT_CONFIG } from '../config.js';
import { GAME_VERSION } from '../../config.js';
import {
  readDemoHeader,
  assertVersionCompatibility,
  VersionMismatchError,
} from '../services/versionCheck.js';
import { validateDirExists, ensureDir } from '../validators.js';
import { enrichAllHighlightsV2 } from '../services/highlightEnricherV2.js';

/**
 * Main analyze-v2 command handler
 * 
 * @param {Object} options - Command options from commander
 * @param {string} options.demos - Path to demos folder
 * @param {string} options.output - Output folder path
 * @param {boolean} options.resetMusic - Reset music mapping offsets
 * @param {string} options.soloKillsFile - Path to solo kills JSON file
 */
async function analyzeV2Command(options) {
  const demosPath = validateDirExists(options.demos, 'Demos folder');
  const outputPath = path.resolve(options.output);
  
  // Load solo kills if provided
  const soloKillsByDemo = loadSoloKills(options.soloKillsFile);
  
  // Find demo files
  const demFiles = findDemoFiles(demosPath);

  // Version compatibility check (fail fast before workers spawn).
  if (options.skipVersionCheck) {
    console.warn('[V2] WARNING: --skip-version-check enabled, demo/game version not verified');
  } else {
    const expected = resolveExpectedVersion(options);
    const demoHeaders = demFiles.map(f => readDemoHeader(f));
    try {
      assertVersionCompatibility({ demoHeaders, expected });
    } catch (err) {
      if (err instanceof VersionMismatchError) {
        console.error(err.message);
        console.error('\nUse --skip-version-check to bypass (not recommended).');
        process.exit(1);
      }
      throw err;
    }
  }

  console.log(`[V2] Found ${demFiles.length} demo file(s)`);
  console.log('[V2] Config:', DEFAULT_CONFIG.detection);
  console.log('[V2] Note: Points not calculated (raw data only)');

  // Initialize results structure
  const results = createResultsStructure();

  // Process each demo file
  for (const demoFile of demFiles) {
    const fileName = path.basename(demoFile);
    console.log(`\n[V2] Processing: ${fileName}`);

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
  
  // Note: Music mapping is NOT generated in V2
  // Use a separate command for music if needed
}

/**
 * Load solo kills from JSON file
 * Format: {"demo.dem": [tick1, tick2], ...}
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
 * Create initial results structure (V2 - no killPoints in config output)
 */
function createResultsStructure() {
  // Create a clean config without killPoints (not used in V2)
  const configV2 = {
    padding: DEFAULT_CONFIG.padding,
    speedup: DEFAULT_CONFIG.speedup,
    slowmo: DEFAULT_CONFIG.slowmo,
    music: DEFAULT_CONFIG.music,
    postprocess: DEFAULT_CONFIG.postprocess,
    detection: DEFAULT_CONFIG.detection,
    priorities: DEFAULT_CONFIG.priorities,
    // Note: killPoints intentionally omitted - points not calculated in V2
  };
  
  return {
    fileType: 'highlights',
    generatedAt: new Date().toISOString(),
    version: 2,  // Mark as V2 format
    config: configV2,
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
 * Process a single demo file (V2 - using detectorV2 and resolverV2)
 */
async function processSingleDemo(demoFile, fileName, soloTicks) {
  // Parse demo (now includes flickAngle, isFlick, airborne)
  const demoData = await parseDemo(demoFile);
  console.log(`  Tick rate: ${demoData.tickRate}`);
  console.log(`  Total kills: ${demoData.kills.length}`);
  console.log(`  Total rounds: ${demoData.rounds.length}`);
  
  // Check for new metadata
  const flickKills = demoData.kills.filter(k => k.isFlick).length;
  const airborneKills = demoData.kills.filter(k => k.airborne).length;
  if (flickKills > 0 || airborneKills > 0) {
    console.log(`  Flick kills: ${flickKills}, Airborne kills: ${airborneKills}`);
  }

  // Detect highlights (V2 - no points)
  let highlights = detectHighlightsV2(demoData, DEFAULT_CONFIG);
  console.log(`  Raw highlights found: ${highlights.length}`);

  // Add solo kill highlights
  const soloHighlights = createSoloHighlights(demoData, soloTicks);
  if (soloHighlights.length > 0) {
    highlights.push(...soloHighlights);
    console.log(`  Added ${soloHighlights.length} solo kill highlight(s)`);
  }

  // Resolve collisions (V2 - no points comparison)
  highlights = resolveCollisionsV2(highlights);
  console.log(`  After collision resolution: ${highlights.length}`);

  // Enrich with basic metadata + round info (V2 - no speedup/slowmo)
  highlights = enrichAllHighlightsV2(highlights, demoData, fileName);

  return {
    file: fileName,
    map: demoData.header.mapName,
    tickRate: demoData.tickRate,
    highlights,
  };
}

/**
 * Create solo kill highlights (V2 - no points)
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
    
    highlights.push({
      type: 'solo',
      priority: soloPriority,
      player: {
        name: kill.attacker.name,
        steamId: kill.attacker.steamId,
      },
      tick: kill.tick,
      kill: {
        tick: kill.tick,
        weapon: kill.weapon,
        headshot: kill.headshot,
        noscope: kill.noscope || false,
        penetrated: kill.penetrated || 0,
        thrusmoke: kill.thrusmoke || false,
        attackerblind: kill.attackerblind || false,
        distance: kill.distance || 0,
        flickAngle: kill.flickAngle || 0,
        isFlick: kill.isFlick || false,
        airborne: kill.airborne || false,
        attackerEquipmentValue: kill.attackerEquipmentValue || 0,
        victimEquipmentValue: kill.victimEquipmentValue || 0,
      },
      // Note: no 'points' field - that's calculated in ranking command
    });
  }
  
  return highlights;
}

/**
 * Update summary with highlights from a demo
 */
function updateSummary(summary, highlights) {
  summary.totalHighlights += highlights.length;
  
  for (const h of highlights) {
    if (summary.byType[h.type] !== undefined) {
      summary.byType[h.type]++;
    }
    // V2: durationSeconds is at top level (no playback object yet)
    if (h.durationSeconds) {
      summary.totalDurationSeconds += h.durationSeconds;
    }
  }
  
  summary.totalDurationSeconds = Math.round(summary.totalDurationSeconds * 100) / 100;
}

/**
 * Write highlights.json to output folder
 */
function writeHighlightsJson(outputPath, results) {
  const outputFile = path.join(outputPath, 'highlights.json');
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(`\n[V2] Results written to: ${outputFile}`);
  console.log(`[V2] Total highlights: ${results.summary.totalHighlights}`);
  console.log('[V2] By type:', results.summary.byType);
}

/**
 * Build the expected version triple from CLI options, falling back to GAME_VERSION.
 * Commander's number parser already coerces --client-version / --server-version /
 * --network-protocol to numbers; missing values come back as `undefined`.
 */
function resolveExpectedVersion(options) {
  const networkProtocolRaw = options.networkProtocol;
  return {
    clientVersion: options.clientVersion ?? GAME_VERSION.clientVersion,
    serverVersion: options.serverVersion ?? GAME_VERSION.serverVersion,
    networkProtocol: (networkProtocolRaw === undefined || Number.isNaN(networkProtocolRaw))
      ? GAME_VERSION.networkProtocol
      : networkProtocolRaw,
  };
}

export { analyzeV2Command };
