/**
 * @fileoverview Top highlights selection command
 * 
 * Ranks all highlights by "impressiveness" score and selects the top N.
 * Useful for creating highlight compilations from large datasets.
 * 
 * Score Formula:
 * Total = Base + Type + KillCount + Intensity + Style + Weapon + Duration + Slowmo
 * 
 * Factors that increase score:
 * - More kills (especially ACE)
 * - Faster kill sequences (low killGapSum)
 * - More headshots
 * - Harder weapons (deagle, scout)
 * - Noscope kills
 * - Shorter duration (better for compilations)
 */

import fs from 'fs';
import path from 'path';
import { parseJsonFile, getHighlights } from '../validators.js';
import { RANKING } from '../../config.js';

/**
 * Pistol weapons that get skill bonus for headshots
 */
const SKILL_PISTOLS = ['deagle', 'revolver'];

/**
 * Scout weapon for skill bonus
 */
const SCOUT_WEAPON = 'ssg08';

/**
 * Main command handler
 * 
 * @param {Object} options - CLI options
 */
async function topCommand(options) {
  const highlightsPath = path.resolve(options.highlights);
  const outputPath = path.resolve(options.output);
  const count = options.count || 10;
  const showScores = options.showScores || false;
  
  // Load highlights
  console.log(`Loading highlights from: ${highlightsPath}`);
  const data = parseJsonFile(highlightsPath, 'Highlights file');
  
  // Get all highlights (supports both formats)
  let highlights = getHighlights(data);
  console.log(`Total highlights: ${highlights.length}`);
  
  // Apply filters
  highlights = applyFilters(highlights, options);
  console.log(`After filters: ${highlights.length}`);
  
  if (highlights.length === 0) {
    console.log('No highlights match the filters.');
    return;
  }
  
  // Calculate scores for all highlights
  const scored = highlights.map(h => ({
    ...h,
    _score: calculateScore(h),
  }));
  
  // Sort by total score descending
  scored.sort((a, b) => b._score.total - a._score.total);
  
  // Apply unique-players limit if specified
  let topHighlights = scored;
  if (options.uniquePlayers) {
    topHighlights = applyUniquePlayers(scored, options.uniquePlayers);
  }
  
  // Take top N
  topHighlights = topHighlights.slice(0, count);
  
  // Add rank
  topHighlights = topHighlights.map((h, i) => ({
    _rank: i + 1,
    ...h,
  }));
  
  // Print score breakdown if requested
  if (showScores) {
    printScoreBreakdown(topHighlights);
  }
  
  // Build output (simple flat format, compatible with other commands)
  const output = {
    generatedAt: new Date().toISOString(),
    sourceFile: path.basename(highlightsPath),
    topCount: topHighlights.length,
    filters: buildFiltersInfo(options),
    highlights: topHighlights,
  };
  
  // Save to file
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nTop ${topHighlights.length} highlights saved to: ${outputPath}`);
  
  // Print summary
  printSummary(topHighlights);
}

/**
 * Apply filters to highlights array
 * 
 * @param {Array} highlights - All highlights
 * @param {Object} options - CLI options with filter values
 * @returns {Array} Filtered highlights
 */
function applyFilters(highlights, options) {
  let result = highlights;
  
  // Filter by player
  if (options.player) {
    result = result.filter(h => h.player?.steamId === options.player);
  }
  
  // Filter by type
  if (options.type) {
    result = result.filter(h => h.type === options.type);
  }
  
  // Filter by minimum kills
  if (options.minKills) {
    result = result.filter(h => {
      const killCount = h.killCount || h.kills?.length || 1;
      return killCount >= options.minKills;
    });
  }
  
  return result;
}

/**
 * Apply unique-players limit
 * Ensures no single player dominates the top highlights
 * 
 * @param {Array} scored - Scored and sorted highlights
 * @param {number} maxPerPlayer - Max highlights per player
 * @returns {Array} Filtered highlights
 */
function applyUniquePlayers(scored, maxPerPlayer) {
  const playerCounts = new Map();
  const result = [];
  
  for (const h of scored) {
    const playerId = h.player?.steamId || h.player?.name || 'unknown';
    const currentCount = playerCounts.get(playerId) || 0;
    
    if (currentCount < maxPerPlayer) {
      result.push(h);
      playerCounts.set(playerId, currentCount + 1);
    }
  }
  
  return result;
}

/**
 * Calculate impressiveness score for a highlight
 * 
 * @param {Object} highlight - Highlight object
 * @returns {Object} Score breakdown
 */
function calculateScore(highlight) {
  const base = highlight.points || 0;
  const typeBonus = getTypeBonus(highlight.type);
  const killCountBonus = getKillCountBonus(highlight);
  const intensityBonus = getIntensityBonus(highlight);
  const styleBonus = getStyleBonus(highlight);
  const weaponBonus = getWeaponSkillBonus(highlight);
  const clutchBonus = getClutchDifficultyBonus(highlight);
  const durationBonus = getDurationBonus(highlight);
  const slowmoBonus = getSlowmoBonus(highlight);
  
  const total = base + typeBonus + killCountBonus + intensityBonus 
              + styleBonus + weaponBonus + clutchBonus + durationBonus + slowmoBonus;
  
  return {
    total: Math.round(total * 10) / 10,
    base,
    typeBonus,
    killCountBonus,
    intensityBonus,
    styleBonus,
    weaponBonus,
    clutchBonus,
    durationBonus,
    slowmoBonus,
  };
}

/**
 * Get type bonus
 */
function getTypeBonus(type) {
  return RANKING.typeBonus[type] || 0;
}

/**
 * Get kill count bonus
 */
function getKillCountBonus(highlight) {
  const killCount = highlight.killCount || highlight.kills?.length || 1;
  
  // Find highest applicable bonus
  let bonus = 0;
  for (const [count, value] of Object.entries(RANKING.killCountBonus)) {
    if (killCount >= parseInt(count)) {
      bonus = value;
    }
  }
  
  return bonus;
}

/**
 * Get intensity bonus based on killGapSum
 * Lower killGapSum = faster kills = higher bonus
 */
function getIntensityBonus(highlight) {
  const killGapSum = highlight.killGapSum || 0;
  return Math.max(0, RANKING.intensityMaxBonus - killGapSum);
}

/**
 * Get style bonuses (headshots, noscope, knife, etc.)
 */
function getStyleBonus(highlight) {
  let bonus = 0;
  const kills = highlight.kills || [];
  
  // Count headshots and noscopes
  let headshotCount = 0;
  let hasNoscopeHeadshot = false;
  let hasNoscopeBody = false;
  
  for (const kill of kills) {
    if (kill.headshot) {
      headshotCount++;
      if (kill.noscope) {
        hasNoscopeHeadshot = true;
      }
    } else if (kill.noscope) {
      hasNoscopeBody = true;
    }
  }
  
  // One-tap is always a headshot
  if (highlight.type === 'one-tap') {
    headshotCount = 1;
  }
  
  // Per-headshot bonus
  bonus += headshotCount * RANKING.styleBonus.perHeadshot;
  
  // All headshots in series bonus
  if (kills.length >= 2 && headshotCount === kills.length) {
    bonus += RANKING.styleBonus.allHeadshotsInSeries;
  }
  
  // Noscope bonuses
  if (hasNoscopeHeadshot) {
    bonus += RANKING.styleBonus.noscopeHeadshot;
  } else if (hasNoscopeBody) {
    bonus += RANKING.styleBonus.noscopeBody;
  }
  
  // Knife in series bonus
  if (highlight.containsKnife) {
    bonus += RANKING.styleBonus.knifeInSeries;
  }
  
  // All headshots with special weapon bonus
  if (highlight.allHeadshotsWithSpecialWeapon) {
    bonus += RANKING.styleBonus.allHeadshotsSpecial;
  }
  
  return bonus;
}

/**
 * Get weapon skill bonus for difficult weapons
 */
function getWeaponSkillBonus(highlight) {
  let bonus = 0;
  const kills = highlight.kills || [];
  
  // Check each kill for skill weapons
  for (const kill of kills) {
    if (!kill.headshot) continue;
    
    const weapon = (kill.weapon || '').toLowerCase().replace('weapon_', '');
    
    // Pistol headshots (deagle, revolver)
    if (SKILL_PISTOLS.some(p => weapon.includes(p))) {
      bonus += RANKING.weaponSkillBonus.pistolHeadshot;
    }
    
    // Scout headshots
    if (weapon.includes(SCOUT_WEAPON)) {
      bonus += RANKING.weaponSkillBonus.scoutHeadshot;
    }
  }
  
  // One-tap with skill weapon
  if (highlight.type === 'one-tap') {
    const weapon = (highlight.weapon || '').toLowerCase().replace('weapon_', '');
    if (SKILL_PISTOLS.some(p => weapon.includes(p))) {
      bonus += RANKING.weaponSkillBonus.pistolHeadshot;
    }
    if (weapon.includes(SCOUT_WEAPON)) {
      bonus += RANKING.weaponSkillBonus.scoutHeadshot;
    }
  }
  
  return bonus;
}

/**
 * Get clutch difficulty bonus
 */
function getClutchDifficultyBonus(highlight) {
  if (highlight.type !== 'clutch') return 0;
  
  // Extract enemy count from situation (e.g., "1v3" -> 3)
  const situation = highlight.situation || '';
  const match = situation.match(/1v(\d+)/);
  if (!match) return 0;
  
  const enemies = parseInt(match[1]);
  return RANKING.clutchDifficulty[enemies] || 0;
}

/**
 * Get duration bonus (shorter = better)
 */
function getDurationBonus(highlight) {
  const duration = highlight.playback?.durationSeconds || highlight.durationSeconds || 0;
  const { maxBonus, divisor } = RANKING.durationBonus;
  return Math.max(0, maxBonus - duration / divisor);
}

/**
 * Get slowmo presence bonus
 */
function getSlowmoBonus(highlight) {
  return highlight.playback?.slowmotion ? RANKING.slowmoBonus : 0;
}

/**
 * Build filters info for output
 */
function buildFiltersInfo(options) {
  const filters = {};
  if (options.player) filters.player = options.player;
  if (options.type) filters.type = options.type;
  if (options.minKills) filters.minKills = options.minKills;
  if (options.uniquePlayers) filters.uniquePlayers = options.uniquePlayers;
  return Object.keys(filters).length > 0 ? filters : null;
}

/**
 * Extract map name from demo filename
 * 
 * @param {string} filename - Demo filename
 * @returns {string} Map name or 'unknown'
 */
function extractMapName(filename) {
  const match = filename?.match(/de_[a-z0-9]+/i);
  return match ? match[0] : 'unknown';
}

/**
 * Print score breakdown to console
 */
function printScoreBreakdown(highlights) {
  console.log('\n=== SCORE BREAKDOWN ===\n');
  
  for (const h of highlights) {
    const s = h._score;
    console.log(`#${h._rank} [${s.total}] ${h.player?.name} - ${formatType(h)}`);
    console.log(`   Base:${s.base} Type:+${s.typeBonus} Kills:+${s.killCountBonus} ` +
                `Int:+${s.intensityBonus.toFixed(1)} Style:+${s.styleBonus} ` +
                `Wpn:+${s.weaponBonus} Dur:+${s.durationBonus.toFixed(1)} Slow:+${s.slowmoBonus}`);
    if (s.clutchBonus > 0) {
      console.log(`   Clutch difficulty:+${s.clutchBonus}`);
    }
    console.log('');
  }
}

/**
 * Format highlight type for display
 */
function formatType(highlight) {
  const type = highlight.type;
  
  switch (type) {
    case 'kill-series':
      return `${highlight.killCount}K`;
    case 'clutch':
      return highlight.situation || 'clutch';
    case 'one-tap':
      return `one-tap ${(highlight.weapon || '').replace('weapon_', '')}`;
    default:
      return type;
  }
}

/**
 * Print summary of top highlights
 */
function printSummary(highlights) {
  console.log('\n=== TOP HIGHLIGHTS ===\n');
  
  for (const h of highlights) {
    const map = extractMapName(h.demoFile);
    console.log(`#${h._rank} [${h._score.total}] ${h.player?.name} - ${formatType(h)} (${map})`);
  }
  
  // Stats
  const byType = {};
  const byPlayer = {};
  
  for (const h of highlights) {
    byType[h.type] = (byType[h.type] || 0) + 1;
    const player = h.player?.name || 'unknown';
    byPlayer[player] = (byPlayer[player] || 0) + 1;
  }
  
  console.log('\nBy type:', byType);
  console.log('By player:', byPlayer);
}

export { topCommand };
