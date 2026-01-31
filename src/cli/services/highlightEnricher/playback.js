/**
 * @fileoverview Playback boundaries calculation
 * 
 * Calculates when to start and stop video playback for a highlight.
 * Handles complex edge cases around round boundaries.
 * 
 * KEY RULE: Never show content from the next round!
 * Players seeing "Round X won/lost" before it happens breaks immersion.
 */

import { roundSeconds, secondsToTicks } from '../../utils/time.js';

/**
 * Round boundary buffer in seconds
 * After round ends, we show this much before cutting
 */
const ROUND_END_BUFFER_SECONDS = 2;

/**
 * Calculate playback boundaries with padding and round constraints
 * 
 * This is a critical function that determines what the viewer sees.
 * It must balance showing context (padding) with avoiding spoilers (round end).
 * 
 * Boundary Rules:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ START: highlight_start - padding_before                     │
 * │        (capped at tick 0)                                   │
 * ├─────────────────────────────────────────────────────────────┤
 * │ END: Minimum of:                                            │
 * │   1. highlight_end + padding_after                          │
 * │   2. current_round.endTick + 2s buffer                      │
 * │   3. next_round.startTick (NEVER enter next round!)         │
 * │   4. last_round.endTick + 2s (demo end)                     │
 * └─────────────────────────────────────────────────────────────┘
 * 
 * @param {number} startTick - Highlight start tick
 * @param {number} endTick - Highlight end tick
 * @param {number} tickRate - Server tick rate (64/128)
 * @param {Array} rounds - Round data from parser
 * @param {Object} paddingConfig - { before: number, after: number } in seconds
 * @returns {Object} Playback boundaries with timing info
 */
function calculatePlaybackBoundaries(startTick, endTick, tickRate, rounds, paddingConfig) {
  const paddingBeforeTicks = secondsToTicks(paddingConfig.before, tickRate);
  const paddingAfterTicks = secondsToTicks(paddingConfig.after, tickRate);
  const roundEndBuffer = secondsToTicks(ROUND_END_BUFFER_SECONDS, tickRate);
  
  // Start: simple padding, capped at 0
  const playbackStartTick = Math.max(0, startTick - paddingBeforeTicks);
  
  // End: start with desired padding
  let playbackEndTick = endTick + paddingAfterTicks;
  
  // Find round context
  const containingRound = findContainingRound(endTick, rounds);
  const nextRound = findNextRound(containingRound, rounds);
  const lastRound = rounds[rounds.length - 1];
  const firstRound = rounds[0];
  
  // Apply round-based caps
  playbackEndTick = applyRoundCaps(
    playbackEndTick,
    endTick,
    containingRound,
    nextRound,
    lastRound,
    firstRound,
    roundEndBuffer,
    tickRate
  );
  
  const durationSeconds = roundSeconds((playbackEndTick - playbackStartTick) / tickRate);
  
  return {
    startTick: playbackStartTick,
    endTick: playbackEndTick,
    durationSeconds,
    paddingBefore: paddingConfig.before,
    paddingAfter: paddingConfig.after,
  };
}

/**
 * Find the round containing a specific tick
 * 
 * @param {number} tick - Tick to find
 * @param {Array} rounds - Round data array
 * @returns {Object|null} Containing round or null
 */
function findContainingRound(tick, rounds) {
  return rounds.find(r => 
    r.startTick <= tick && r.endTick && r.endTick >= tick
  ) || null;
}

/**
 * Find the next round after a given round
 * 
 * @param {Object|null} currentRound - Current round
 * @param {Array} rounds - Round data array
 * @returns {Object|null} Next round or null
 */
function findNextRound(currentRound, rounds) {
  if (!currentRound) return null;
  const index = rounds.indexOf(currentRound);
  return index >= 0 && index < rounds.length - 1 ? rounds[index + 1] : null;
}

/**
 * Apply round-based caps to playback end tick
 * 
 * @private
 */
function applyRoundCaps(
  playbackEndTick,
  highlightEndTick,
  containingRound,
  nextRound,
  lastRound,
  firstRound,
  roundEndBuffer,
  tickRate
) {
  let cappedEnd = playbackEndTick;
  
  // Cap 1: Current round end + buffer
  if (containingRound?.endTick) {
    cappedEnd = Math.min(cappedEnd, containingRound.endTick + roundEndBuffer);
  }
  
  // Cap 2: NEVER enter next round (highest priority)
  if (nextRound?.startTick) {
    cappedEnd = Math.min(cappedEnd, nextRound.startTick);
  }
  
  // Cap 3: Demo end (last round end + buffer)
  if (lastRound?.endTick) {
    cappedEnd = Math.min(cappedEnd, lastRound.endTick + roundEndBuffer);
  }
  
  // Special case: Warmup/pre-game highlights
  // These occur before Round 1 and need special handling
  if (!containingRound && firstRound && highlightEndTick < firstRound.startTick) {
    const minimalPadding = secondsToTicks(2, tickRate);
    cappedEnd = Math.min(highlightEndTick + minimalPadding, firstRound.startTick);
  }
  
  return cappedEnd;
}

export {
  calculatePlaybackBoundaries,
  findContainingRound,
  findNextRound,
};
