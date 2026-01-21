// Default priority levels for highlights (used for collision resolution)
const PRIORITIES = {
  'kill-series': 2,
  'knife': 3,
  'collateral': 4,
  'clutch': 5,
};

// Default point values for kills (higher = more impressive)
// pistol body < rifle body < sniper body < pistol headshot < rifle headshot < sniper headshot < sniper noscope
const KILL_POINTS = {
  'pistol_body': 1,
  'rifle_body': 2,
  'sniper_body': 3,
  'pistol_headshot': 4,
  'rifle_headshot': 5,
  'sniper_headshot': 6,
  'sniper_noscope': 7,
  'knife': 8,  // Knife kills are always impressive
};

/**
 * Calculate points for a single kill
 * @param {Object} kill - Kill event object
 * @param {Object} killPoints - Kill points config (optional, uses defaults)
 * @returns {number} Points value
 */
function calculateKillPoints(kill, killPoints = KILL_POINTS) {
  // Knife is special
  if (kill.isKnife) {
    return killPoints.knife || KILL_POINTS.knife;
  }

  const category = kill.weaponCategory || 'rifle';
  
  // Sniper noscope is the highest
  if (category === 'sniper' && kill.noscope) {
    return killPoints.sniper_noscope || KILL_POINTS.sniper_noscope;
  }

  // Build key based on weapon category and headshot
  const modifier = kill.headshot ? 'headshot' : 'body';
  const key = `${category}_${modifier}`;
  
  return killPoints[key] || KILL_POINTS[key] || KILL_POINTS.rifle_body;
}

/**
 * Detect all highlights from parsed demo data
 * @param {Object} demoData - Parsed demo data from parser
 * @param {Object} config - Full configuration (detection, killPoints, priorities)
 * @returns {Array} Array of highlight objects
 */
function detectHighlights(demoData, config) {
  const highlights = [];
  const { tickRate, kills, rounds } = demoData;
  
  // Extract config sections (support both old flat config and new nested config)
  const detection = config.detection || config;
  const killPoints = config.killPoints || KILL_POINTS;
  const priorities = config.priorities || PRIORITIES;

  // Convert max delay from seconds to ticks
  const maxDelayTicks = detection.maxDelay * tickRate;

  // Detect kill series first
  const killSeriesHighlights = detectKillSeries(kills, maxDelayTicks, detection.minSeriesKills, killPoints, priorities);
  highlights.push(...killSeriesHighlights);

  // Collect knife kills that are already part of a series (by player + tick)
  // These should not generate separate knife highlights
  const knifeKillsInSeries = new Set();
  for (const series of killSeriesHighlights) {
    if (series.containsKnife) {
      const playerKey = series.player.steamId || series.player.name;
      for (const kill of series.kills) {
        // Check if this kill in the series is a knife kill
        // We need to match against original kills to check isKnife
        const originalKill = kills.find(k => 
          k.tick === kill.tick && 
          (k.attacker.steamId || k.attacker.name) === playerKey &&
          k.isKnife
        );
        if (originalKill) {
          knifeKillsInSeries.add(`${playerKey}_${kill.tick}`);
        }
      }
    }
  }

  // Detect collaterals (multiple kills on same tick)
  const collateralHighlights = detectCollaterals(kills, killPoints, priorities);
  highlights.push(...collateralHighlights);

  // Detect knife kills (excluding those already in a series)
  const knifeHighlights = detectKnifeKills(kills, killPoints, priorities, knifeKillsInSeries);
  highlights.push(...knifeHighlights);

  // Detect clutches
  const clutchHighlights = detectClutches(rounds, detection.minEnemies, priorities);
  highlights.push(...clutchHighlights);

  return highlights;
}

/**
 * Detect kill series (consecutive kills within time window)
 * 
 * A kill series qualifies as a highlight if:
 * - It has at least minSeriesKills kills, OR
 * - It has at least 2 kills AND contains a knife kill, OR
 * - It has at least 2 kills AND all are headshots with special weapons (deagle/revolver/sniper/shotgun)
 * 
 * @param {Array} kills - Array of kill events
 * @param {number} maxDelayTicks - Max ticks between kills
 * @param {number} minSeriesKills - Minimum kills for a regular series (2-kill with knife always qualifies)
 * @param {Object} killPoints - Kill points config
 * @param {Object} priorities - Priorities config
 * @returns {Array} Kill series highlights
 */
function detectKillSeries(kills, maxDelayTicks, minSeriesKills, killPoints = KILL_POINTS, priorities = PRIORITIES) {
  const highlights = [];
  
  // Group kills by attacker
  const killsByAttacker = new Map();
  
  for (const kill of kills) {
    const attackerId = kill.attacker.name; // Use name as identifier
    if (!killsByAttacker.has(attackerId)) {
      killsByAttacker.set(attackerId, []);
    }
    killsByAttacker.get(attackerId).push(kill);
  }

  // For each attacker, find kill series
  for (const [, attackerKills] of killsByAttacker) {
    // Sort by tick
    attackerKills.sort((a, b) => a.tick - b.tick);

    let seriesStart = 0;
    
    for (let i = 1; i <= attackerKills.length; i++) {
      const isLastKill = i === attackerKills.length;
      const prevKill = attackerKills[i - 1];
      const currentKill = attackerKills[i];
      
      // Check if series should end (time gap too long OR round changed)
      const shouldEndSeries = isLastKill || 
        (currentKill.tick - prevKill.tick > maxDelayTicks) ||
        (currentKill.round !== prevKill.round);

      if (shouldEndSeries) {
        const seriesLength = i - seriesStart;
        const seriesKills = attackerKills.slice(seriesStart, i);
        
        // Check if series contains a knife kill
        const containsKnife = seriesKills.some(k => k.isKnife);
        
        // Check if all kills are headshots with special weapons (deagle, sniper, shotgun)
        const allHeadshotsWithSpecialWeapon = seriesKills.every(k => 
          k.headshot && k.isHeadshotSeriesWeapon
        );
        
        // Series qualifies if:
        // - Meets minimum kills threshold, OR
        // - Has at least 2 kills AND contains a knife kill, OR
        // - Has at least 2 kills AND all are headshots with special weapons (deagle/sniper/shotgun)
        const qualifies = seriesLength >= minSeriesKills || 
          (seriesLength >= 2 && containsKnife) ||
          (seriesLength >= 2 && allHeadshotsWithSpecialWeapon);
        
        if (qualifies) {
          const firstKill = seriesKills[0];
          const lastKill = seriesKills[seriesKills.length - 1];
          
          // Calculate total points for the series
          const points = seriesKills.reduce((sum, k) => sum + calculateKillPoints(k, killPoints), 0);
          
          // Build kills array with detailed info for each frag
          const kills = seriesKills.map(k => ({
            tick: k.tick,
            weapon: k.weapon,
            headshot: k.headshot,
            noscope: k.noscope || false,
            firstShotTick: k.firstShotTick || null, // When player started shooting
          }));
          
          // Kill series priority (knife-containing series keep same priority as regular series)
          // Collision between kill-series is resolved by killCount, then by points
          const priority = priorities['kill-series'] || PRIORITIES['kill-series'];
          
          highlights.push({
            type: 'kill-series',
            priority,
            player: {
              name: firstKill.attacker.name,
              steamId: firstKill.attacker.steamId,
            },
            startTick: firstKill.tick,
            endTick: lastKill.tick,
            killCount: seriesLength,
            points,
            kills,
            containsKnife,
            allHeadshotsWithSpecialWeapon,
          });
        }
        
        seriesStart = i;
      }
    }
  }

  return highlights;
}

/**
 * Detect collaterals (2+ kills with one shot, same tick)
 * @param {Array} kills - Array of kill events
 * @param {Object} killPoints - Kill points config
 * @param {Object} priorities - Priorities config
 * @returns {Array} Collateral highlights
 */
function detectCollaterals(kills, killPoints = KILL_POINTS, priorities = PRIORITIES) {
  const highlights = [];
  
  // Group kills by attacker and tick
  const killsByAttackerAndTick = new Map();
  
  for (const kill of kills) {
    const key = `${kill.attacker.name}_${kill.tick}`;
    if (!killsByAttackerAndTick.has(key)) {
      killsByAttackerAndTick.set(key, []);
    }
    killsByAttackerAndTick.get(key).push(kill);
  }

  // Find collaterals (2+ kills on same tick)
  for (const [, tickKills] of killsByAttackerAndTick) {
    if (tickKills.length >= 2) {
      const firstKill = tickKills[0];
      
      // Calculate total points for collateral kills
      const points = tickKills.reduce((sum, k) => sum + calculateKillPoints(k, killPoints), 0);
      
      // Build kills array with detailed info
      const kills = tickKills.map(k => ({
        tick: k.tick,
        weapon: k.weapon,
        headshot: k.headshot,
        noscope: k.noscope || false,
      }));
      
      highlights.push({
        type: 'collateral',
        priority: priorities['collateral'] || PRIORITIES['collateral'],
        player: {
          name: firstKill.attacker.name,
          steamId: firstKill.attacker.steamId,
        },
        tick: firstKill.tick,
        killCount: tickKills.length,
        points,
        kills,
      });
    }
  }

  return highlights;
}

/**
 * Detect knife kills
 * @param {Array} kills - Array of kill events
 * @param {Object} killPoints - Kill points config
 * @param {Object} priorities - Priorities config
 * @param {Set} excludeKills - Set of "playerId_tick" keys to exclude (knife kills already in series)
 * @returns {Array} Knife kill highlights
 */
function detectKnifeKills(kills, killPoints = KILL_POINTS, priorities = PRIORITIES, excludeKills = new Set()) {
  const highlights = [];
  
  for (const kill of kills) {
    if (kill.isKnife) {
      // Skip knife kills that are already part of a kill series
      const playerKey = kill.attacker.steamId || kill.attacker.name;
      const killKey = `${playerKey}_${kill.tick}`;
      if (excludeKills.has(killKey)) {
        continue;
      }
      
      const points = calculateKillPoints(kill, killPoints);
      
      highlights.push({
        type: 'knife',
        priority: priorities['knife'] || PRIORITIES['knife'],
        player: {
          name: kill.attacker.name,
          steamId: kill.attacker.steamId,
        },
        tick: kill.tick,
        points,
        weapon: kill.weapon,
      });
    }
  }

  return highlights;
}

/**
 * Detect clutches (1vX situations won)
 * @param {Array} rounds - Array of round data
 * @param {number} minEnemies - Minimum enemies for clutch to count
 * @param {Object} priorities - Priorities config
 * @returns {Array} Clutch highlights
 */
function detectClutches(rounds, minEnemies, priorities = PRIORITIES) {
  const highlights = [];
  
  for (const round of rounds) {
    if (!round.clutchSituation) continue;
    
    const { clutchSituation, winner, endTick } = round;
    
    // Check if clutch player's team won
    if (clutchSituation.team !== winner) continue;
    
    // Check minimum enemies requirement
    if (clutchSituation.enemies < minEnemies) continue;
    
    // Require at least 1 kill by the clutch player
    const kills = clutchSituation.kills || [];
    if (kills.length < 1) continue;
    
    // Points for clutch based on difficulty (enemies * 10)
    const points = clutchSituation.enemies * 10;
    
    highlights.push({
      type: 'clutch',
      priority: priorities['clutch'] || PRIORITIES['clutch'],
      player: clutchSituation.player,
      round: round.number,
      situation: `1v${clutchSituation.enemies}`,
      startTick: clutchSituation.startTick,
      endTick: endTick,
      points,
      kills, // Array of kills with tick, weapon, headshot, noscope
    });
  }

  return highlights;
}

module.exports = {
  detectHighlights,
  detectKillSeries,
  detectCollaterals,
  detectKnifeKills,
  detectClutches,
  calculateKillPoints,
  PRIORITIES,
  KILL_POINTS,
};
