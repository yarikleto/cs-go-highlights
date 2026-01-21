#!/usr/bin/env node

const { program } = require('commander');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { parseDemo } = require('./parser');
const { detectHighlights } = require('./detector');
const { resolveCollisions } = require('./resolver');
const { recordAllHighlights } = require('./recorder');
const { mergeClips, cleanupTempFiles, generateSummary } = require('./merger');

// Default configuration (full config for generation)
const DEFAULT_CONFIG = {
  // Padding settings (in seconds) - adjust these to control clip length
  padding: {
    before: 4,  // seconds before highlight starts
    after: 3,   // seconds after highlight ends
  },
  
  // Detection settings
  detection: {
    maxDelay: 15,           // seconds between kills for series
    minSeriesKills: 3,      // minimum kills for regular series (2-kill series with knife always qualifies)
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

// Record command - record highlights using HLAE
program
  .command('record')
  .description('Record highlights using HLAE (produces individual clips)')
  .requiredOption('--highlights <path>', 'Path to highlights.json file')
  .requiredOption('--demos <path>', 'Path to folder with .dem files')
  .requiredOption('--hlae <path>', 'Path to HLAE executable (hlae.exe)')
  .requiredOption('--csgo <path>', 'Path to CS:GO installation folder')
  .option('--output <path>', 'Output folder for clips', './output')
  .option('--player <steamId>', 'Filter highlights by player Steam ID')
  .option('--id <highlightId>', 'Record only a specific highlight by ID (for debugging)')
  .action(recordCommand);

// Merge command - merge recorded clips into a single video
program
  .command('merge')
  .description('Merge recorded clips into a single video using FFmpeg')
  .requiredOption('--clips <path>', 'Path to folder containing clip files (.mp4)')
  .option('--output <path>', 'Output path for final video', './output/highlights_final.mp4')
  .option('--cleanup', 'Delete individual clips after merging')
  .action(mergeCommand);

// Compress command - compress a video to reduce file size
program
  .command('compress')
  .description('Compress a video file to reduce file size')
  .requiredOption('--input <path>', 'Path to input video file')
  .option('--power <level>', 'Compression power 1-10 (1=light, 10=maximum)', '5')
  .option('--output <path>', 'Output path for compressed video')
  .action(compressCommand);

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
        
        // Generate unique ID based on highlight properties (stable across re-runs)
        const idSource = `${fileName}|${h.player.steamId}|${h.type}|${startTick}|${endTick}`;
        const id = crypto.createHash('sha256').update(idSource).digest('hex').substring(0, 12);
        
        // Calculate duration in seconds (without padding)
        const durationSeconds = (endTick - startTick) / tickRate;
        
        // Calculate playback ticks with padding
        const paddingBefore = DEFAULT_CONFIG.padding.before;
        const paddingAfter = DEFAULT_CONFIG.padding.after;
        const paddingBeforeTicks = Math.round(paddingBefore * tickRate);
        const paddingAfterTicks = Math.round(paddingAfter * tickRate);
        const playbackStartTick = Math.max(0, startTick - paddingBeforeTicks);
        
        // Calculate playback end tick, capped at round end
        let playbackEndTick = endTick + paddingAfterTicks;
        
        // Find the round that contains this highlight
        const containingRound = demoData.rounds.find(r => 
          r.startTick <= endTick && r.endTick && r.endTick >= endTick
        );
        
        // Find the first round (to handle warmup/pre-game highlights)
        const firstRound = demoData.rounds[0];
        
        // Cap playback at round end + 2 second buffer, but NEVER show next round
        const roundEndBuffer = Math.round(2 * tickRate); // 2 seconds after round end
        
        // Find next round to ensure we NEVER show new round visuals
        const roundIndex = containingRound ? demoData.rounds.indexOf(containingRound) : -1;
        const nextRound = roundIndex >= 0 ? demoData.rounds[roundIndex + 1] : null;
        const lastRound = demoData.rounds[demoData.rounds.length - 1];
        
        if (containingRound && containingRound.endTick) {
          // Cap at round end + buffer
          let cappedEnd = containingRound.endTick + roundEndBuffer;
          
          // Also cap at next round start to NEVER show new round
          if (nextRound && nextRound.startTick) {
            cappedEnd = Math.min(cappedEnd, nextRound.startTick);
          }
          
          playbackEndTick = Math.min(playbackEndTick, cappedEnd);
        }
        
        // Also cap at demo end (last round's end + buffer)
        if (lastRound && lastRound.endTick) {
          playbackEndTick = Math.min(playbackEndTick, lastRound.endTick + roundEndBuffer);
        }
        
        // Handle first round (before Round 1's startTick in demo data)
        if (!containingRound && firstRound && endTick < firstRound.startTick) {
          // Use minimal padding after last kill, capped at Round 1 start
          const minimalPadding = Math.round(2 * tickRate); // 2 seconds after last kill
          playbackEndTick = Math.min(endTick + minimalPadding, firstRound.startTick);
        }
        
        // Calculate total playback duration
        const playbackDurationSeconds = (playbackEndTick - playbackStartTick) / tickRate;
        
        return {
          id,
          ...h,
          demoFile: fileName,
          durationSeconds: Math.round(durationSeconds * 100) / 100,
          playback: {
            startTick: playbackStartTick,
            endTick: playbackEndTick,
            durationSeconds: Math.round(playbackDurationSeconds * 100) / 100,
            paddingBefore: paddingBefore,
            paddingAfter: paddingAfter,
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

async function recordCommand(options) {
  const highlightsPath = path.resolve(options.highlights);
  const demosPath = path.resolve(options.demos);
  const hlaePath = path.resolve(options.hlae);
  const csgoPath = path.resolve(options.csgo);
  const outputPath = path.resolve(options.output);
  const playerFilter = options.player || null;
  const idFilter = options.id || null;

  // Validate highlights.json exists
  if (!fs.existsSync(highlightsPath)) {
    console.error(`Error: Highlights file not found: ${highlightsPath}`);
    process.exit(1);
  }

  // Validate demos folder exists
  if (!fs.existsSync(demosPath)) {
    console.error(`Error: Demos folder not found: ${demosPath}`);
    process.exit(1);
  }

  // Validate HLAE executable exists
  if (!fs.existsSync(hlaePath)) {
    console.error(`Error: HLAE executable not found: ${hlaePath}`);
    process.exit(1);
  }

  // Validate CS:GO folder exists
  if (!fs.existsSync(csgoPath)) {
    console.error(`Error: CS:GO folder not found: ${csgoPath}`);
    process.exit(1);
  }

  // Parse highlights.json
  let highlightsData;
  try {
    const content = fs.readFileSync(highlightsPath, 'utf-8');
    highlightsData = JSON.parse(content);
  } catch (err) {
    console.error(`Error: Failed to parse highlights.json: ${err.message}`);
    process.exit(1);
  }

  // Count total highlights (with filters)
  let totalHighlights = 0;
  for (const demo of highlightsData.demos) {
    for (const highlight of demo.highlights) {
      const matchesPlayer = !playerFilter || highlight.player.steamId === playerFilter;
      const matchesId = !idFilter || highlight.id === idFilter;
      if (matchesPlayer && matchesId) {
        totalHighlights++;
      }
    }
  }

  if (totalHighlights === 0) {
    console.error('Error: No highlights found to record');
    if (playerFilter) {
      console.error(`  (filtered by player: ${playerFilter})`);
    }
    if (idFilter) {
      console.error(`  (filtered by ID: ${idFilter})`);
    }
    process.exit(1);
  }

  console.log('CS:GO Highlights Recorder');
  console.log('=========================');
  console.log(`Highlights file: ${highlightsPath}`);
  console.log(`Demos folder: ${demosPath}`);
  console.log(`HLAE path: ${hlaePath}`);
  console.log(`CS:GO path: ${csgoPath}`);
  console.log(`Output folder: ${outputPath}`);
  console.log(`Total highlights to record: ${totalHighlights}`);
  if (playerFilter) {
    console.log(`Filtering by player: ${playerFilter}`);
  }
  if (idFilter) {
    console.log(`Filtering by ID: ${idFilter}`);
  }

  // Ensure output directory exists
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }

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
    });

    if (recordedClips.length === 0) {
      console.error('\nError: No clips were recorded successfully');
      process.exit(1);
    }

    console.log('\n=========================');
    console.log('Recording Complete!');
    console.log('=========================');
    console.log(`Recorded ${recordedClips.length} clips`);
    console.log(`Clips saved to: ${path.join(outputPath, 'clips')}`);
    console.log(`\nTo merge clips into a single video, run:`);
    console.log(`  node src/index.js merge --clips "${path.join(outputPath, 'clips')}"`);

    // Cleanup temp files
    cleanupTempFiles(outputPath);

  } catch (err) {
    console.error(`\nError during recording: ${err.message}`);
    process.exit(1);
  }
}

async function mergeCommand(options) {
  const clipsPath = path.resolve(options.clips);
  const outputPath = path.resolve(options.output);
  const shouldCleanup = options.cleanup || false;

  // Validate clips folder exists
  if (!fs.existsSync(clipsPath)) {
    console.error(`Error: Clips folder not found: ${clipsPath}`);
    process.exit(1);
  }

  // Find all .mp4 files in the clips folder
  const clipFiles = fs.readdirSync(clipsPath)
    .filter(file => file.endsWith('.mp4'))
    .sort() // Sort alphabetically to maintain order (clip_0001, clip_0002, etc.)
    .map(file => path.join(clipsPath, file));

  if (clipFiles.length === 0) {
    console.error(`Error: No .mp4 files found in: ${clipsPath}`);
    process.exit(1);
  }

  console.log('CS:GO Highlights Merger');
  console.log('=======================');
  console.log(`Clips folder: ${clipsPath}`);
  console.log(`Output file: ${outputPath}`);
  console.log(`Found ${clipFiles.length} clips to merge`);
  if (shouldCleanup) {
    console.log('Cleanup: Will delete clips after merging');
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    await mergeClips({
      clipPaths: clipFiles,
      outputPath,
      cleanupClips: shouldCleanup,
    });

    // Generate and display summary
    const summary = await generateSummary(outputPath, clipFiles.length);

    console.log('\n=======================');
    console.log('Merge Complete!');
    console.log('=======================');
    console.log(`Final video: ${summary.outputFile}`);
    console.log(`Total clips: ${summary.clipCount}`);
    console.log(`Duration: ${summary.durationFormatted}`);
    console.log(`File size: ${summary.fileSizeMB} MB`);

  } catch (err) {
    console.error(`\nError during merging: ${err.message}`);
    process.exit(1);
  }
}

async function compressCommand(options) {
  const inputPath = path.resolve(options.input);
  const power = parseInt(options.power, 10);
  
  // Validate input file exists
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }
  
  // Validate power level
  if (isNaN(power) || power < 1 || power > 10) {
    console.error('Error: Compression power must be between 1 and 10');
    process.exit(1);
  }
  
  // Generate output path if not specified
  let outputPath;
  if (options.output) {
    outputPath = path.resolve(options.output);
  } else {
    const inputDir = path.dirname(inputPath);
    const inputName = path.basename(inputPath, path.extname(inputPath));
    outputPath = path.join(inputDir, `${inputName}_compressed.mp4`);
  }
  
  // Map power (1-10) to CRF value (18-36)
  // Power 1 = CRF 18 (minimal compression, high quality)
  // Power 10 = CRF 36 (maximum compression, lower quality)
  const crf = 18 + Math.round((power - 1) * (36 - 18) / 9);
  
  // Get input file size
  const inputStats = fs.statSync(inputPath);
  const inputSizeMB = (inputStats.size / (1024 * 1024)).toFixed(2);
  
  console.log('CS:GO Highlights Compressor');
  console.log('===========================');
  console.log(`Input: ${inputPath}`);
  console.log(`Output: ${outputPath}`);
  console.log(`Power: ${power}/10 (CRF: ${crf})`);
  console.log(`Input size: ${inputSizeMB} MB`);
  console.log('');
  console.log('Compressing video...');
  
  try {
    await runFfmpegCompress(inputPath, outputPath, crf);
    
    // Get output file size
    const outputStats = fs.statSync(outputPath);
    const outputSizeMB = (outputStats.size / (1024 * 1024)).toFixed(2);
    const reduction = (((inputStats.size - outputStats.size) / inputStats.size) * 100).toFixed(1);
    
    console.log('\n===========================');
    console.log('Compression Complete!');
    console.log('===========================');
    console.log(`Output: ${outputPath}`);
    console.log(`Original size: ${inputSizeMB} MB`);
    console.log(`Compressed size: ${outputSizeMB} MB`);
    console.log(`Size reduction: ${reduction}%`);
    
  } catch (err) {
    console.error(`\nError during compression: ${err.message}`);
    process.exit(1);
  }
}

function runFfmpegCompress(inputPath, outputPath, crf) {
  const { spawn } = require('child_process');
  
  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-c:v', 'libx264',
      '-crf', crf.toString(),
      '-preset', 'medium',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-y',
      outputPath,
    ];
    
    const ffmpeg = spawn('ffmpeg', args, {
      stdio: 'pipe',
      windowsHide: true,
    });
    
    let errorOutput = '';
    let lastProgress = '';
    
    ffmpeg.stderr.on('data', (data) => {
      const output = data.toString();
      errorOutput += output;
      
      // Extract and display progress
      const timeMatch = output.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
      if (timeMatch && timeMatch[1] !== lastProgress) {
        lastProgress = timeMatch[1];
        process.stdout.write(`\r  Progress: ${lastProgress}`);
      }
    });
    
    ffmpeg.on('close', (code) => {
      process.stdout.write('\n');
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg compression failed with code ${code}`));
      }
    });
    
    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to run FFmpeg: ${err.message}. Make sure FFmpeg is installed and in PATH.`));
    });
  });
}

