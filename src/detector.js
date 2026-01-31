/**
 * @fileoverview Highlight detection module - Re-export facade
 * 
 * This file maintains backward compatibility by re-exporting from
 * the new modular structure in ./detector/
 * 
 * The detector system is now organized as:
 *   detector/
 *   ├── index.js          - Main orchestrator (Facade pattern)
 *   ├── constants.js      - Configuration constants
 *   ├── utils.js          - Shared utilities
 *   ├── highlightFactory.js - Factory for highlight objects
 *   ├── killSeries.js     - Kill series detection
 *   ├── collateral.js     - Collateral detection
 *   ├── knife.js          - Knife kill detection
 *   └── clutch.js         - Clutch detection
 * 
 * @module detector
 * @see ./detector/index.js for the main implementation
 */

// Re-export everything from the modular implementation
// This preserves the original API for existing consumers
export * from './detector/index.js';
