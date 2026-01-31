#!/usr/bin/env node

/**
 * @fileoverview CS:GO Highlights CLI - Entry point
 * 
 * This file maintains backward compatibility by re-exporting from
 * the modular CLI structure in ./cli/
 * 
 * The CLI is now organized as:
 *   cli/
 *   ├── index.js              - Main CLI with command definitions
 *   ├── config.js             - Configuration constants
 *   ├── validators.js         - Input validation utilities
 *   ├── utils/
 *   │   ├── index.js          - Utils barrel export
 *   │   ├── time.js           - Time formatting utilities
 *   │   └── ffmpeg.js         - FFmpeg wrapper functions
 *   ├── services/
 *   │   └── highlightEnricher.js - Playback metadata calculation
 *   └── commands/
 *       ├── index.js          - Commands barrel export
 *       ├── analyze.js        - Detect highlights from demos
 *       ├── record.js         - Capture clips using HLAE
 *       ├── postprocessUI.js  - Apply visual effects
 *       ├── postprocessSound.js - Apply background music
 *       ├── merge.js          - Combine clips into video
 *       ├── compress.js       - Reduce video file size
 *       ├── playerKills.js    - Analyze player kills
 *       ├── mergeMusic.js     - Combine audio files
 *       └── resyncMusic.js    - Recalculate music timing
 * 
 * @see ./cli/index.js for the main implementation
 */

require('./cli/index');
