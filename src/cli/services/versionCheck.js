/**
 * @fileoverview Version compatibility utilities.
 *
 * Pure-logic module: parses steam.inf and demo headers, then asserts
 * the configured version matches what's actually installed and what the
 * demo files report. Used by `analyze-v2` and `record` commands.
 */

export class VersionMismatchError extends Error {
  constructor(reasons) {
    if (!Array.isArray(reasons) || reasons.length === 0) {
      throw new Error('VersionMismatchError requires at least one reason');
    }
    super(`Game version compatibility check failed:\n  • ${reasons.join('\n  • ')}`);
    this.name = 'VersionMismatchError';
    this.reasons = reasons;
  }
}
