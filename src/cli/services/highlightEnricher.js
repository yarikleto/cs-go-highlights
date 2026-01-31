/**
 * @fileoverview Highlight Enrichment Service - Re-export facade
 * 
 * This file re-exports from the highlightEnricher/ folder for backward compatibility.
 * The actual implementation is split into focused modules:
 * 
 * - highlightEnricher/index.js  → Main orchestration
 * - highlightEnricher/utils.js  → ID generation, metrics
 * - highlightEnricher/playback.js → Playback boundaries
 * - highlightEnricher/speedup.js  → Speed-up detection
 * - highlightEnricher/slowmo.js   → Slow motion detection
 * 
 * @module highlightEnricher
 */

export {
  enrichHighlight,
  enrichAllHighlights,
  getHighlightTickRange,
  generateHighlightId,
  calculateKillGapSum,
  calculatePlaybackBoundaries,
  calculateSpeedupSegments,
  calculateSlowmotion,
} from './highlightEnricher/index.js';
