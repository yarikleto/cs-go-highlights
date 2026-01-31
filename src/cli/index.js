#!/usr/bin/env node

/**
 * @fileoverview CS:GO Highlights CLI - Main entry point
 * 
 * This is a complete video production pipeline for CS:GO/CS2 highlights:
 * 
 * Pipeline:
 * 1. analyze   - Parse demos, detect highlights, generate music mapping
 * 2. record    - Capture highlights using HLAE
 * 3. postprocess-ui    - Apply visual effects (speedup, slowmo, overlay)
 * 4. postprocess-sound - Apply background music
 * 5. merge     - Combine clips into final video
 * 
 * Utility commands:
 * - compress     - Reduce video file size
 * - player-kills - Analyze kills by specific player
 * - merge-music  - Combine audio files
 * - resync-music - Recalculate music timing from offsets
 * - timestamps   - Generate highlight timestamps list
 * - top          - Select top N highlights by impressiveness score
 * 
 * @example
 * # Full pipeline
 * node src/index.js analyze --demos ./demos
 * node src/index.js record --highlights ./output/highlights.json --demos ./demos --hlae ./hlae.exe --csgo "C:/Steam/cs2"
 * node src/index.js postprocess-ui --highlights ./output/highlights.json
 * node src/index.js postprocess-sound --highlights ./output/highlights.json
 * node src/index.js merge --clips ./output/clips_final
 */

import { program } from 'commander';
import {
  analyzeCommand,
  resyncMusicCommand,
  recordCommand,
  postprocessUICommand,
  postprocessSoundCommand,
  mergeCommand,
  compressCommand,
  playerKillsCommand,
  mergeMusicCommand,
  timestampsCommand,
  topCommand,
} from './commands/index.js';
import {
  PATHS,
  SPEEDUP,
  SLOWMO,
  MUSIC,
  ENCODING,
  MERGE,
} from '../config.js';

// CLI metadata
program
  .name('csgo-highlights')
  .description('CLI tool for CS:GO demo highlights')
  .version('1.0.0');

/*
 * =============================================================================
 * MAIN PIPELINE COMMANDS
 * =============================================================================
 */

program
  .command('analyze')
  .description('Analyze demo files and detect highlights')
  .option('--demos <path>', 'Path to folder with .dem files', PATHS.demos)
  .option('--output <path>', 'Output folder for highlights.json', PATHS.output)
  .option('--reset-music', 'Reset music mapping (discard existing offsets)')
  .option('--solo-kills-file <path>', 'Path to JSON file with solo kills mapping')
  .action(analyzeCommand);

program
  .command('record')
  .description('Record highlights using HLAE (produces raw clips without effects)')
  .option('--highlights <path>', 'Path to highlights.json file', PATHS.highlights)
  .option('--demos <path>', 'Path to folder with .dem files', PATHS.demos)
  .option('--hlae <path>', 'Path to HLAE executable (hlae.exe)', PATHS.hlae)
  .option('--csgo <path>', 'Path to CS:GO installation folder', PATHS.csgo)
  .option('--output <path>', 'Output folder for clips', PATHS.output)
  .option('--player <steamId>', 'Filter highlights by player Steam ID')
  .option('--id <highlightId>', 'Record only a specific highlight by ID (for debugging)')
  .option('--voice-chat', 'Enable voice chat and text chat in recordings')
  .action(recordCommand);

program
  .command('postprocess-ui')
  .description('Apply visual effects to recorded clips (slowmo, speedup, overlay)')
  .option('--highlights <path>', 'Path to highlights.json file', PATHS.highlights)
  .option('--clips <path>', 'Path to folder containing raw clips', PATHS.clips)
  .option('--output <path>', 'Output folder for processed clips', PATHS.clipsProcessed)
  .option('--speedup <multiplier>', `Speed up clutch gaps (default: ${SPEEDUP.defaultMultiplier}x)`, parseFloat, SPEEDUP.defaultMultiplier)
  .option('--overlay', 'Show player name and highlight type overlay (fade in/out)', true)
  .option('--slowmo <factor>', `Slow motion on last kill if headshot/noscope (default: ${SLOWMO.defaultFactor})`, parseFloat, SLOWMO.defaultFactor)
  .option('--force', 'Re-process all clips even if already processed')
  .option('--id <highlightId>', 'Process only a specific highlight by ID')
  .action(postprocessUICommand);

program
  .command('postprocess-sound')
  .description('Apply music to processed clips (separate step for fast music fine-tuning)')
  .option('--highlights <path>', 'Path to highlights.json file', PATHS.highlights)
  .option('--clips <path>', 'Path to processed clips folder', PATHS.clipsProcessed)
  .option('--output <path>', 'Output folder for clips with music', PATHS.clipsFinal)
  .option('--music <folder>', 'Path to music folder', MUSIC.defaultFolder)
  .option('--music-volume <percent>', `Music volume 0-100 (default: ${MUSIC.defaultMusicVolumePercent})`, parseFloat, MUSIC.defaultMusicVolumePercent)
  .option('--force', 'Re-apply music even if already applied')
  .option('--id <highlightId>', 'Apply music only to a specific highlight by ID')
  .action(postprocessSoundCommand);

program
  .command('merge')
  .description('Merge recorded clips into a single video using FFmpeg')
  .requiredOption('--clips <path>', 'Path to folder containing clip files (.mp4)')
  .option('--output <path>', 'Output path for final video', PATHS.highlightsFinal)
  .option('--cleanup', 'Delete individual clips after merging')
  .option('--transition <duration>', `Crossfade transition duration in seconds (default: ${MERGE.transition.duration})`, parseFloat, MERGE.transition.enabled ? MERGE.transition.duration : undefined)
  .option('--no-transition', 'Disable transitions between clips')
  .action(mergeCommand);

/*
 * =============================================================================
 * UTILITY COMMANDS
 * =============================================================================
 */

program
  .command('compress')
  .description('Compress a video file to reduce file size')
  .requiredOption('--input <path>', 'Path to input video file')
  .option('--power <level>', `Compression power 1-10 (1=light, 10=maximum)`, parseInt, ENCODING.defaultCompressionPower)
  .option('--output <path>', 'Output path for compressed video')
  .action(compressCommand);

program
  .command('player-kills')
  .description('Show all kills by a player in a demo file')
  .requiredOption('--demo <path>', 'Path to demo file (.dem)')
  .requiredOption('--steamid <id>', 'Player Steam ID (64-bit format)')
  .action(playerKillsCommand);

program
  .command('merge-music')
  .description('Merge all songs in music folder into one file')
  .option('--music <folder>', 'Path to music folder', MUSIC.defaultFolder)
  .option('--output <path>', 'Output path for merged song (default: named after first song)')
  .action(mergeMusicCommand);

program
  .command('resync-music')
  .description('Recalculate music startTime/endTime based on manual offset values in music-mapping.json')
  .option('--mapping <path>', 'Path to music-mapping.json', PATHS.musicMapping)
  .action(resyncMusicCommand);

program
  .command('timestamps')
  .description('Generate a list of highlight timestamps (after speedup/slowmo) with type, map, and player')
  .option('--highlights <path>', 'Path to highlights.json file', PATHS.highlights)
  .option('--output <path>', 'Output file path for timestamps', PATHS.timestamps)
  .option('--speedup <multiplier>', `Speedup multiplier used in postprocess (default: ${SPEEDUP.defaultMultiplier})`, parseFloat, SPEEDUP.defaultMultiplier)
  .option('--slowmo <factor>', `Slowmo factor used in postprocess (default: ${SLOWMO.defaultFactor})`, parseFloat, SLOWMO.defaultFactor)
  .action(timestampsCommand);

program
  .command('top')
  .description('Select top N highlights by impressiveness score')
  .option('--highlights <path>', 'Path to highlights.json file', PATHS.highlights)
  .option('--count <n>', 'Number of top highlights to select', parseInt, 10)
  .option('--output <path>', 'Output file path for top highlights', './output/highlights_top.json')
  .option('--show-scores', 'Print detailed score breakdown to console')
  .option('--player <steamId>', 'Filter by player Steam ID')
  .option('--type <type>', 'Filter by highlight type (kill-series, clutch, etc.)')
  .option('--min-kills <n>', 'Minimum kill count', parseInt)
  .option('--unique-players <n>', 'Max highlights per player (for variety)', parseInt)
  .action(topCommand);

// Parse CLI arguments
program.parse(process.argv);
