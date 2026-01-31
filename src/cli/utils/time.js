/**
 * @fileoverview Time formatting utilities
 */

/**
 * Format seconds to MM:SS display format
 * 
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time string (e.g., "2:35")
 * 
 * @example
 * formatTime(155) // "2:35"
 * formatTime(65)  // "1:05"
 */
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Format seconds to HH:MM:SS display format
 * 
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time string (e.g., "1:02:35")
 */
function formatTimeLong(seconds) {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return formatTime(seconds);
}

/**
 * Convert ticks to seconds using tick rate
 * 
 * @param {number} ticks - Number of game ticks
 * @param {number} tickRate - Server tick rate (typically 64 or 128)
 * @returns {number} Time in seconds
 */
function ticksToSeconds(ticks, tickRate) {
  return ticks / tickRate;
}

/**
 * Convert seconds to ticks using tick rate
 * 
 * @param {number} seconds - Time in seconds
 * @param {number} tickRate - Server tick rate
 * @returns {number} Number of game ticks (rounded)
 */
function secondsToTicks(seconds, tickRate) {
  return Math.round(seconds * tickRate);
}

/**
 * Round seconds to 2 decimal places (for display)
 * 
 * @param {number} seconds - Raw seconds value
 * @returns {number} Rounded seconds
 */
function roundSeconds(seconds) {
  return Math.round(seconds * 100) / 100;
}

export {
  formatTime,
  formatTimeLong,
  ticksToSeconds,
  secondsToTicks,
  roundSeconds,
};
