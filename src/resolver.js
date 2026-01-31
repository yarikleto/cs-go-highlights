/**
 * Get the tick range for a highlight
 * @param {Object} highlight - Highlight object
 * @returns {Object} { start, end } tick range
 */
function getTickRange(highlight) {
  if (highlight.type === 'knife' || highlight.type === 'collateral') {
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
 * Compare two highlights for collision resolution
 * Returns positive if a wins, negative if b wins, 0 if equal
 * @param {Object} a - First highlight
 * @param {Object} b - Second highlight
 * @returns {number}
 */
function compareHighlights(a, b) {
  // First compare by priority
  if (a.priority !== b.priority) {
    return a.priority - b.priority;
  }
  
  // For kill-series vs kill-series, compare by kill count first
  // (3 kills > 2 kills, even if 2 kills has knife with more points)
  if (a.type === 'kill-series' && b.type === 'kill-series') {
    const killCountA = a.killCount || 0;
    const killCountB = b.killCount || 0;
    if (killCountA !== killCountB) {
      return killCountA - killCountB;
    }
  }
  
  // If priority (and killCount for series) is equal, compare by points
  const pointsA = a.points || 0;
  const pointsB = b.points || 0;
  return pointsA - pointsB;
}

/**
 * Resolve collisions between overlapping highlights
 * Only resolves collisions between highlights from the SAME player
 * Different players' highlights at the same time are all kept
 * Higher priority highlights take precedence
 * If priority is equal, higher points wins
 * 
 * @param {Array} highlights - Array of highlight objects
 * @returns {Array} Filtered highlights with collisions resolved
 */
function resolveCollisions(highlights) {
  if (highlights.length <= 1) {
    return highlights;
  }

  // Sort by start tick, then by priority (descending), then by points (descending)
  const sorted = [...highlights].sort((a, b) => {
    const rangeA = getTickRange(a);
    const rangeB = getTickRange(b);
    
    if (rangeA.start !== rangeB.start) {
      return rangeA.start - rangeB.start;
    }
    // Higher priority first, then higher points
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
  resolveCollisions,
  compareHighlights,
  getTickRange,
  getPlayerId,
  rangesOverlap,
};
