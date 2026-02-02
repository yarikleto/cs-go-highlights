/**
 * @fileoverview Collision resolver V2 - Without points comparison
 * 
 * Simplified collision resolution that only uses:
 * - priority (highlight type importance)
 * - killCount (for kill-series comparisons)
 * 
 * No points comparison - that logic moves to ranking command
 */

/**
 * Get the tick range for a highlight
 * @param {Object} highlight - Highlight object
 * @returns {Object} { start, end } tick range
 */
function getTickRange(highlight) {
  if (highlight.type === 'knife' || highlight.type === 'collateral' || highlight.type === 'one-tap') {
    // Single-tick highlights
    return { start: highlight.tick, end: highlight.tick };
  }
  // Range highlights (kill-series, clutch)
  return { start: highlight.startTick, end: highlight.endTick };
}

/**
 * Get player identifier from highlight
 * @param {Object} highlight - Highlight object
 * @returns {string} Player identifier (steamId or name)
 */
function getPlayerId(highlight) {
  return highlight.player?.steamId || highlight.player?.name || 'unknown';
}

/**
 * Check if two tick ranges overlap
 * @param {Object} range1 - { start, end }
 * @param {Object} range2 - { start, end }
 * @returns {boolean}
 */
function rangesOverlap(range1, range2) {
  return range1.start <= range2.end && range2.start <= range1.end;
}

/**
 * Compare two highlights for collision resolution (V2 - no points)
 * Returns positive if a wins, negative if b wins, 0 if equal
 * 
 * Comparison order:
 * 1. priority (higher wins)
 * 2. killCount for kill-series (more kills wins)
 * 3. Equal = both kept (first one wins in collision)
 * 
 * @param {Object} a - First highlight
 * @param {Object} b - Second highlight
 * @returns {number}
 */
function compareHighlights(a, b) {
  // First compare by priority
  if (a.priority !== b.priority) {
    return a.priority - b.priority;
  }
  
  // For kill-series vs kill-series, compare by kill count
  if (a.type === 'kill-series' && b.type === 'kill-series') {
    const killCountA = a.killCount || 0;
    const killCountB = b.killCount || 0;
    if (killCountA !== killCountB) {
      return killCountA - killCountB;
    }
  }
  
  // For collateral vs collateral, compare by kill count
  if (a.type === 'collateral' && b.type === 'collateral') {
    const killCountA = a.killCount || 0;
    const killCountB = b.killCount || 0;
    if (killCountA !== killCountB) {
      return killCountA - killCountB;
    }
  }
  
  // For clutch vs clutch, compare by enemies count
  if (a.type === 'clutch' && b.type === 'clutch') {
    const enemiesA = a.enemies || 0;
    const enemiesB = b.enemies || 0;
    if (enemiesA !== enemiesB) {
      return enemiesA - enemiesB;
    }
  }
  
  // Equal - first one wins in collision
  return 0;
}

/**
 * Resolve collisions between overlapping highlights (V2 - no points)
 * Only resolves collisions between highlights from the SAME player
 * Different players' highlights at the same time are all kept
 * 
 * @param {Array} highlights - Array of highlight objects
 * @returns {Array} Filtered highlights with collisions resolved
 */
function resolveCollisionsV2(highlights) {
  if (highlights.length <= 1) {
    return highlights;
  }

  // Sort by start tick, then by priority (descending), then by killCount (descending)
  const sorted = [...highlights].sort((a, b) => {
    const rangeA = getTickRange(a);
    const rangeB = getTickRange(b);
    
    if (rangeA.start !== rangeB.start) {
      return rangeA.start - rangeB.start;
    }
    // Higher priority first
    const comparison = compareHighlights(b, a);
    return comparison;
  });

  const result = [];
  const removed = new Set();

  for (let i = 0; i < sorted.length; i++) {
    if (removed.has(i)) continue;

    const current = sorted[i];
    const currentRange = getTickRange(current);
    const currentPlayer = getPlayerId(current);

    // Check against all subsequent highlights for overlaps
    for (let j = i + 1; j < sorted.length; j++) {
      if (removed.has(j)) continue;

      const other = sorted[j];
      const otherRange = getTickRange(other);

      // If other starts after current ends, no more overlaps possible
      if (otherRange.start > currentRange.end) break;

      // Only resolve collisions between same player's highlights
      const otherPlayer = getPlayerId(other);
      if (currentPlayer !== otherPlayer) continue;

      // Check for overlap
      if (rangesOverlap(currentRange, otherRange)) {
        // Compare and remove the loser
        const comparison = compareHighlights(current, other);
        if (comparison >= 0) {
          // Current wins or tie (keep current)
          removed.add(j);
        } else {
          // Other wins
          removed.add(i);
          break; // Current was removed, stop checking
        }
      }
    }

    if (!removed.has(i)) {
      result.push(current);
    }
  }

  // Sort result by tick for final output
  return result.sort((a, b) => {
    const rangeA = getTickRange(a);
    const rangeB = getTickRange(b);
    return rangeA.start - rangeB.start;
  });
}

export {
  resolveCollisionsV2,
  compareHighlights,
  getTickRange,
  getPlayerId,
  rangesOverlap,
};
