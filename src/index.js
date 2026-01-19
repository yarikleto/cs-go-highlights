#!/usr/bin/env node

const { program } = require('commander');
const path = require('path');
const fs = require('fs');
const { parseDemo } = require('./parser');
const { detectHighlights, KILL_POINTS, PRIORITIES } = require('./detector');
const { resolveCollisions } = require('./resolver');

// Default configuration (full config for generation)
const DEFAULT_CONFIG = {
  // Detection settings
  detection: {
    maxDelay: 15,           // seconds between kills for series
    minKills: 3,            // minimum kills for kill series
    minEnemies: 2,          // minimum enemies for clutch (1vX)
  },
  
  // Kill points (higher = more impressive)
  // Used for sorting and collision resolution when priority is equal
  killPoints: {
    pistol_body: 1,
    rifle_body: 2,
    sniper_body: 3,
    pistol_headshot: 4,
    rifle_headshot: 5,
    sniper_headshot: 6,
    sniper_noscope: 7,
    knife: 8,
  },
  
  // Highlight priorities (higher = more important)
  // Used for collision resolution between same player's highlights
  priorities: {
    'kill-series': 2,
    'knife': 3,
    'collateral': 4,
    'clutch': 5,
  },
};

program
  .name('csgo-highlights')
  .description('CLI tool for CS:GO demo highlights')
  .version('1.0.0');

// Analyze command - detect highlights from demo files
program
  .command('analyze')
  .description('Analyze demo files and detect highlights')
  .requiredOption('--demos <path>', 'Path to folder with .dem files')
  .option('--output <path>', 'Output folder for highlights.json', './output')
  .action(analyzeCommand);

program.parse(process.argv);

async function analyzeCommand(options) {
  const demosPath = path.resolve(options.demos);
  const outputPath = path.resolve(options.output);
  
  // Validate demos folder exists
  if (!fs.existsSync(demosPath)) {
    console.error(`Error: Demos folder not found: ${demosPath}`);
    process.exit(1);
  }

  // Find all .dem files
  const demFiles = fs.readdirSync(demosPath)
    .filter(file => file.endsWith('.dem'))
    .map(file => path.join(demosPath, file));

  if (demFiles.length === 0) {
    console.error(`Error: No .dem files found in: ${demosPath}`);
    process.exit(1);
  }

  console.log(`Found ${demFiles.length} demo file(s)`);
  console.log('Config:', DEFAULT_CONFIG.detection);

  const results = {
    generatedAt: new Date().toISOString(),
    config: DEFAULT_CONFIG,
    demos: [],
    summary: {
      totalHighlights: 0,
      totalDurationSeconds: 0,
      byType: {
        'kill-series': 0,
        'collateral': 0,
        'knife': 0,
        'clutch': 0,
      },
    },
  };

  // Process each demo file
  for (const demoFile of demFiles) {
    const fileName = path.basename(demoFile);
    console.log(`\nProcessing: ${fileName}`);

    try {
      // Parse demo and extract events
      const demoData = await parseDemo(demoFile);
      console.log(`  Tick rate: ${demoData.tickRate}`);
      console.log(`  Total kills: ${demoData.kills.length}`);
      console.log(`  Total rounds: ${demoData.rounds.length}`);

      // Detect highlights
      let highlights = detectHighlights(demoData, DEFAULT_CONFIG);
      console.log(`  Raw highlights found: ${highlights.length}`);

      // Resolve collisions
      highlights = resolveCollisions(highlights);
      console.log(`  After collision resolution: ${highlights.length}`);

      // Padding settings (in seconds)
      const PADDING_BEFORE = 2; // seconds before highlight
      const PADDING_AFTER = 1;  // seconds after highlight
      
      // Add demo file reference, duration, and playback info to each highlight
      highlights = highlights.map(h => {
        const tickRate = demoData.tickRate;
        
        // Get the highlight's tick range
        let startTick, endTick;
        if (h.tick !== undefined) {
          // Single-tick highlights (knife, collateral)
          startTick = h.tick;
          endTick = h.tick;
        } else {
          // Range highlights (kill-series, clutch)
          startTick = h.startTick;
          endTick = h.endTick;
        }
        
        // Calculate duration in seconds (without padding)
        const durationSeconds = (endTick - startTick) / tickRate;
        
        // Calculate playback ticks with padding
        const paddingBeforeTicks = Math.round(PADDING_BEFORE * tickRate);
        const paddingAfterTicks = Math.round(PADDING_AFTER * tickRate);
        const playbackStartTick = Math.max(0, startTick - paddingBeforeTicks);
        const playbackEndTick = endTick + paddingAfterTicks;
        
        // Calculate total playback duration
        const playbackDurationSeconds = (playbackEndTick - playbackStartTick) / tickRate;
        
        return {
          ...h,
          demoFile: fileName,
          durationSeconds: Math.round(durationSeconds * 100) / 100,
          playback: {
            startTick: playbackStartTick,
            endTick: playbackEndTick,
            durationSeconds: Math.round(playbackDurationSeconds * 100) / 100,
            paddingBefore: PADDING_BEFORE,
            paddingAfter: PADDING_AFTER,
          },
        };
      });

      // Add to results
      results.demos.push({
        file: fileName,
        tickRate: demoData.tickRate,
        highlights,
      });

      // Update summary
      results.summary.totalHighlights += highlights.length;
      for (const h of highlights) {
        results.summary.byType[h.type]++;
        results.summary.totalDurationSeconds += h.playback.durationSeconds;
      }
      // Round total duration
      results.summary.totalDurationSeconds = Math.round(results.summary.totalDurationSeconds * 100) / 100;
    } catch (error) {
      console.error(`  Error processing ${fileName}: ${error.message}`);
      // Continue with other demos
    }
  }

  // Ensure output directory exists
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }

  // Write results
  const outputFile = path.join(outputPath, 'highlights.json');
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(`\nResults written to: ${outputFile}`);
  console.log(`Total highlights: ${results.summary.totalHighlights}`);
  console.log('By type:', results.summary.byType);
}

