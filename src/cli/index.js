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
 * Commands are registered from the shared config (src/shared/commandsConfig.js)
 * which is also used by the Electron UI.
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
  extractCommand,
  analyzeCommand,
  analyzeV2Command,
  analyzePostprocessUICommand,
  resyncMusicCommand,
  recordCommand,
  postprocessUICommand,
  postprocessSoundCommand,
  mergeCommand,
  compressCommand,
  playerKillsCommand,
  playersCommand,
  mergeMusicCommand,
  timestampsCommand,
  topCommand,
  applyMusicCommand,
} from './commands/index.js';
import { registerAllCommands } from './registerCommands.js';

// CLI metadata
program
  .name('csgo-highlights')
  .description('CLI tool for CS:GO demo highlights')
  .version('1.0.0');

// Action handlers map
const actions = {
  extractCommand,
  analyzeCommand,
  analyzeV2Command,
  analyzePostprocessUICommand,
  resyncMusicCommand,
  recordCommand,
  postprocessUICommand,
  postprocessSoundCommand,
  mergeCommand,
  compressCommand,
  playerKillsCommand,
  playersCommand,
  mergeMusicCommand,
  timestampsCommand,
  topCommand,
  applyMusicCommand,
};

// Register all commands from shared config
registerAllCommands(program, actions);

// Parse CLI arguments
program.parse(process.argv);
