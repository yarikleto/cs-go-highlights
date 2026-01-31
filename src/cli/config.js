/**
 * @fileoverview CLI configuration re-exports
 * 
 * Re-exports configuration from centralized src/config.js for backward compatibility.
 * All configuration is now defined in src/config.js
 */

export {
  DEFAULT_CONFIG,
  HIGHLIGHT_TYPES,
  mergeConfig,
} from '../config.js';
