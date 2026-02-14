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
 * Weapon categories for headshot bonus scoring
 */
const WEAPON_CATEGORIES = {
  deagle: ['deagle', 'revolver'],
  pistol: ['glock', 'usp', 'hkp2000', 'p2000', 'p250', 'fiveseven', 'tec9', 'cz75', 'elite'],
  shotgun: ['nova', 'xm1014', 'mag7', 'sawedoff'],
  smg: ['mac10', 'mp9', 'mp7', 'mp5sd', 'ump45', 'p90', 'bizon'],
  sniper: ['awp', 'ssg08', 'g3sg1', 'scar20'],
  machinegun: ['m249', 'negev'],
  // Everything else is rifle (default)
};

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
  
  // Always sort by score descending to select the BEST highlights
  scored.sort((a, b) => b._score.total - a._score.total);
  
  // Apply unique-players limit if specified
  let topHighlights = scored;
  if (options.uniquePlayers) {
    topHighlights = applyUniquePlayers(scored, options.uniquePlayers);
  }
  
  // Take top N
  topHighlights = topHighlights.slice(0, count);
  
  // Add rank (always #1 = best score)
  topHighlights = topHighlights.map((h, i) => ({
    rank: i + 1,
    ...h,
  }));
  
  // Reverse display order if --asc (show worst of selected first)
  if (options.asc) {
    topHighlights = topHighlights.reverse();
  }
  
  // Print score breakdown if requested
  if (showScores) {
    printScoreBreakdown(topHighlights);
  }
  
  // Calculate summary statistics
  const summary = calculateSummary(topHighlights);
  
  // Build output (simple flat format, compatible with other commands)
  const output = {
    fileType: 'highlights-top',
    generatedAt: new Date().toISOString(),
    sourceFile: path.basename(highlightsPath),
    topCount: topHighlights.length,
    filters: buildFiltersInfo(options),
    summary,
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
  const conditionBonus = getKillConditionBonus(highlight);
  const clutchBonus = getClutchDifficultyBonus(highlight);
  const durationBonus = getDurationBonus(highlight);
  const slowmoBonus = getSlowmoBonus(highlight);
  
  const total = base + typeBonus + killCountBonus + intensityBonus 
              + styleBonus + weaponBonus + conditionBonus + clutchBonus + durationBonus + slowmoBonus;
  
  return {
    total: Math.round(total * 10) / 10,
    base,
    typeBonus,
    killCountBonus,
    intensityBonus,
    styleBonus,
    weaponBonus,
    conditionBonus,
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
  
  if (killCount < 3) return 0;
  
  const { basePerKill, growthPerKill } = RANKING.killCountFormula;
  
  let bonus = 0;
  for (let i = 3; i <= killCount; i++) {
    // Progressive bonus: each kill worth more than previous
    bonus += basePerKill + (i - 3) * growthPerKill;
  }
  
  // Rapid fire bonus - many kills in short time is spectacular
  const killGapSum = highlight.killGapSum || 0;
  const rapidFire = RANKING.rapidFire;
  if (rapidFire && killGapSum <= rapidFire.threshold && killCount >= 3) {
    bonus *= rapidFire.multiplier;
  }
  
  return bonus;
}

/**
 * Get intensity bonus based on killGapSum AND kill count
 * Fast kills are only impressive if there are many of them
 * Formula: max(0, maxBonus - gap^exponent) × (killCount - 1)
 */
function getIntensityBonus(highlight) {
  // Clutches don't get intensity bonus - speed of clutch isn't that impressive
  if (highlight.type === 'clutch') return 0;
  
  const killCount = highlight.killCount || highlight.kills?.length || 1;
  
  // 1 kill = no intensity bonus (speed of single kill doesn't matter)
  if (killCount <= 1) return 0;
  
  const killGapSum = highlight.killGapSum || 0;
  const exponent = RANKING.gapPenaltyExponent || 1;
  const penalty = Math.pow(killGapSum, exponent);
  const baseIntensity = Math.max(0, RANKING.intensityMaxBonus - penalty);
  
  // Scale intensity by kill count - more kills + fast = exponentially better
  const killMultiplier = killCount - 1;
  return baseIntensity * killMultiplier;
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
  
  // Progressive headshot bonus: 1st HS = base, 2nd = base+growth, etc.
  // Formula: sum of (base + i*growth) for i from 0 to headshotCount-1
  const hsBase = RANKING.styleBonus.headshotBase || 2;
  const hsGrowth = RANKING.styleBonus.headshotGrowth || 2;
  for (let i = 0; i < headshotCount; i++) {
    bonus += hsBase + i * hsGrowth;
  }
  
  // All headshots in series bonus (only for 3+ kills)
  if (kills.length >= 3 && headshotCount === kills.length) {
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
  
  // Taser/Zeus in series bonus
  if (highlight.containsTaser) {
    bonus += RANKING.styleBonus.taserInSeries;
  }
  
  // All headshots with special weapon bonus (only for 3+ kills)
  if (highlight.allHeadshotsWithSpecialWeapon && kills.length >= 3) {
    bonus += RANKING.styleBonus.allHeadshotsSpecial;
  }
  
  return bonus;
}

/**
 * Get weapon skill bonus for difficult weapons
 */
/**
 * Get weapon category for scoring
 */
function getWeaponCategory(weapon) {
  const normalized = (weapon || '').toLowerCase().replace('weapon_', '');
  
  for (const [category, weapons] of Object.entries(WEAPON_CATEGORIES)) {
    if (weapons.some(w => normalized.includes(w))) {
      return category;
    }
  }
  return 'rifle'; // Default
}

function getWeaponSkillBonus(highlight) {
  let bonus = 0;
  const kills = highlight.kills || [];
  const bonuses = RANKING.weaponHeadshotBonus;
  const killCount = highlight.killCount || kills.length || 1;
  
  // Headshot multiplier scales with kill count
  // 2K = 1x, 3K = 1.5x, 4K = 2x, 5K = 2.5x, etc.
  const hsMultiplier = killCount / 2;
  
  // Check each kill for weapon bonus
  for (const kill of kills) {
    const category = getWeaponCategory(kill.weapon);
    
    // Noscope bonus (any noscope kill, not just headshot)
    if (kill.noscope && category === 'sniper') {
      bonus += (bonuses.noscope || 0) * hsMultiplier;
    }
    // Regular headshot bonus - scaled by kill count
    else if (kill.headshot) {
      bonus += (bonuses[category] || 0) * hsMultiplier;
    }
  }
  
  // One-tap weapon bonus
  if (highlight.type === 'one-tap') {
    const category = getWeaponCategory(highlight.weapon);
    bonus += bonuses[category] || 0;
  }
  
  return Math.round(bonus * 10) / 10;
}

/**
 * Easy/spam weapons that get a penalty
 */
const EASY_WEAPONS = {
  autosniper: ['scar20', 'g3sg1'],
  negev: ['negev'],
};

/**
 * Get easy weapon category (for penalty)
 */
function getEasyWeaponCategory(weapon) {
  const normalized = (weapon || '').toLowerCase().replace('weapon_', '');
  
  for (const [category, weapons] of Object.entries(EASY_WEAPONS)) {
    if (weapons.some(w => normalized.includes(w))) {
      return category;
    }
  }
  return null;
}

/**
 * Get kill condition bonus (wallbang, thrusmoke, attackerblind, distance)
 * Also applies penalty for easy/spam weapons
 */
function getKillConditionBonus(highlight) {
  let bonus = 0;
  const kills = highlight.kills || [];
  const bonuses = RANKING.killConditionBonus;
  const penalties = RANKING.easyWeaponPenalty || {};
  const distanceThreshold = RANKING.longDistanceThreshold || 3000;
  
  for (const kill of kills) {
    // Attacker was flashed
    if (kill.attackerblind) {
      bonus += bonuses.attackerblind || 0;
    }
    
    // Wallbang (penetrated through surface)
    if (kill.penetrated > 0) {
      bonus += bonuses.wallbang || 0;
    }
    
    // Through smoke
    if (kill.thrusmoke) {
      bonus += bonuses.thrusmoke || 0;
    }
    
    // Long distance kill
    if (kill.distance > distanceThreshold) {
      bonus += bonuses.longDistance || 0;
    }
    
    // Easy weapon penalty
    const easyCategory = getEasyWeaponCategory(kill.weapon);
    if (easyCategory) {
      bonus += penalties[easyCategory] || 0;
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
    console.log(`#${h.rank} [${s.total}] ${h.player?.name} - ${formatType(h)}`);
    console.log(`   Base:${s.base} Type:+${s.typeBonus} Kills:+${s.killCountBonus} ` +
                `Int:+${s.intensityBonus.toFixed(1)} Style:+${s.styleBonus} ` +
                `Wpn:+${s.weaponBonus} Cond:+${s.conditionBonus} Dur:+${s.durationBonus.toFixed(1)} Slow:+${s.slowmoBonus}`);
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
/**
 * Calculate summary statistics for highlights
 */
function calculateSummary(highlights) {
  const byType = {};
  let totalDurationSeconds = 0;
  
  for (const h of highlights) {
    byType[h.type] = (byType[h.type] || 0) + 1;
    totalDurationSeconds += h.playback?.durationSeconds || h.durationSeconds || 0;
  }
  
  return {
    totalHighlights: highlights.length,
    totalDurationSeconds: Math.round(totalDurationSeconds * 100) / 100,
    byType,
  };
}

/**
 * Format duration in seconds to human-readable string
 */
function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function printSummary(highlights) {
  console.log('\n=== TOP HIGHLIGHTS ===\n');
  
  for (const h of highlights) {
    const map = extractMapName(h.demoFile);
    console.log(`#${h.rank} [${h._score.total}] ${h.player?.name} - ${formatType(h)} (${map})`);
  }
  
  // Calculate stats
  const summary = calculateSummary(highlights);
  
  // By player
  const byPlayer = {};
  for (const h of highlights) {
    const player = h.player?.name || 'unknown';
    byPlayer[player] = (byPlayer[player] || 0) + 1;
  }
  
  console.log(`\nTotal duration: ${formatDuration(summary.totalDurationSeconds)}`);
  console.log('By type:', summary.byType);
  console.log('By player:', byPlayer);
}

export { topCommand };
