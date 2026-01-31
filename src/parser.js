import fs from 'fs';
import { DemoFile } from 'demofile';
import {
  PISTOL_WEAPONS,
  SNIPER_WEAPONS,
  SHOTGUN_WEAPONS,
  HEADSHOT_SERIES_WEAPONS,
  KNIFE_WEAPONS,
  TIMING,
  DETECTION,
} from './config.js';

/**
 * Get weapon category: 'pistol', 'sniper', 'shotgun', 'rifle', or 'knife'
 * @param {string} weapon - Weapon name
 * @returns {string}
 */
function getWeaponCategory(weapon) {
  if (!weapon) return 'rifle';
  const normalized = weapon.toLowerCase().replace('weapon_', '');
  
  if (KNIFE_WEAPONS.some(k => normalized.includes(k) || normalized === 'knife')) {
    return 'knife';
  }
  if (SNIPER_WEAPONS.includes(normalized)) {
    return 'sniper';
  }
  if (SHOTGUN_WEAPONS.includes(normalized)) {
    return 'shotgun';
  }
  if (PISTOL_WEAPONS.includes(normalized)) {
    return 'pistol';
  }
  return 'rifle';
}

/**
 * Check if a weapon qualifies for headshot series highlight
 * (deagle, revolver, snipers, shotguns)
 * @param {string} weapon - Weapon name
 * @returns {boolean}
 */
function isHeadshotSeriesWeapon(weapon) {
  if (!weapon) return false;
  const normalized = weapon.toLowerCase().replace('weapon_', '');
  return HEADSHOT_SERIES_WEAPONS.includes(normalized);
}

/**
 * Check if a weapon is a knife
 * @param {string} weapon - Weapon name
 * @returns {boolean}
 */
function isKnife(weapon) {
  if (!weapon) return false;
  const normalizedWeapon = weapon.toLowerCase().replace('weapon_', '');
  return KNIFE_WEAPONS.some(k => normalizedWeapon.includes(k) || normalizedWeapon === 'knife');
}

/**
 * Parse a demo file and extract relevant events
 * @param {string} filePath - Path to .dem file
 * @returns {Promise<Object>} Demo data with kills, rounds, and metadata
 */
function parseDemo(filePath) {
  return new Promise((resolve, reject) => {
    const buffer = fs.readFileSync(filePath);
    const demoFile = new DemoFile();

    const kills = [];
    const rounds = [];
    let currentRound = null;
    let tickRate = TIMING.fallbackTickRate; // Default, will be calculated from header
    let matchStarted = false;
    let isWarmup = true;

    // Track alive players per team for clutch detection
    let aliveCT = 0;
    let aliveT = 0;
    
    // Track recent shots by player (steamId -> array of shot ticks)
    // Used to find when player started shooting before a kill
    const recentShotsByPlayer = new Map();
    
    // Track ALL shots by player for speedup calculation
    // (steamId -> array of {tick, weapon})
    const allShotsByPlayer = new Map();

    demoFile.on('start', () => {
      // Calculate tick rate from header
      if (demoFile.header.playbackTime > 0) {
        tickRate = Math.round(demoFile.header.playbackTicks / demoFile.header.playbackTime);
      }
    });

    // Match started event
    demoFile.gameEvents.on('round_announce_match_start', () => {
      matchStarted = true;
      isWarmup = false;
    });

    // Alternative match start detection
    demoFile.gameEvents.on('begin_new_match', () => {
      matchStarted = true;
      isWarmup = false;
    });

    // Round start
    demoFile.gameEvents.on('round_start', (e) => {
      // Count alive players at round start
      const players = demoFile.entities.players;
      aliveCT = 0;
      aliveT = 0;

      for (const player of players) {
        if (player && player.isAlive) {
          if (player.teamNumber === 3) aliveCT++; // CT
          else if (player.teamNumber === 2) aliveT++; // T
        }
      }

      currentRound = {
        number: rounds.length + 1,
        startTick: demoFile.currentTick,
        endTick: null,
        winner: null,
        aliveCTAtStart: aliveCT,
        aliveTAtStart: aliveT,
        clutchSituation: null,
      };
    });

    // Round end
    demoFile.gameEvents.on('round_end', (e) => {
      if (currentRound) {
        currentRound.endTick = demoFile.currentTick;
        currentRound.winner = e.winner; // 2 = T, 3 = CT
        rounds.push(currentRound);
        currentRound = null;
      }

      // Reset warmup flag after first official round
      if (matchStarted) {
        isWarmup = false;
      }
    });

    // Round officially ended (freeze time starts)
    demoFile.gameEvents.on('round_officially_ended', () => {
      // Additional cleanup if needed
    });

    // Track weapon fire events to know when player started shooting
    demoFile.gameEvents.on('weapon_fire', (e) => {
      const shooter = demoFile.entities.getByUserId(e.userid);
      if (!shooter) return;
      
      const steamId = shooter.steam64Id?.toString();
      if (!steamId) return;
      
      const currentTick = demoFile.currentTick;
      
      // Store shot tick for recent lookback (used for firstShotTick)
      if (!recentShotsByPlayer.has(steamId)) {
        recentShotsByPlayer.set(steamId, []);
      }
      
      const shots = recentShotsByPlayer.get(steamId);
      shots.push(currentTick);
      
      // Keep only shots from last N seconds (to avoid memory issues)
      const maxAge = tickRate * DETECTION.maxShotAge;
      while (shots.length > 0 && shots[0] < currentTick - maxAge) {
        shots.shift();
      }
      
      // Store ALL shots for speedup calculation
      if (!allShotsByPlayer.has(steamId)) {
        allShotsByPlayer.set(steamId, []);
      }
      allShotsByPlayer.get(steamId).push(currentTick);
    });

    // Player death
    demoFile.gameEvents.on('player_death', (e) => {
      const attacker = demoFile.entities.getByUserId(e.attacker);
      const victim = demoFile.entities.getByUserId(e.userid);

      // Skip if no attacker (suicide/world kill)
      if (!attacker || !victim) return;

      // Skip team kills
      if (attacker.teamNumber === victim.teamNumber) return;

      // Skip warmup kills (heuristic: if match hasn't started and we're in first few rounds)
      if (isWarmup && !matchStarted && rounds.length < 1) return;

      const weaponCategory = getWeaponCategory(e.weapon);
      
      // Find the first shot before this kill (within short window)
      // Only look at shots close to the kill - we don't want random misses from earlier
      const attackerSteamId = attacker.steam64Id?.toString() || null;
      let firstShotTick = null;
      if (attackerSteamId && recentShotsByPlayer.has(attackerSteamId)) {
        const shots = recentShotsByPlayer.get(attackerSteamId);
        const currentTick = demoFile.currentTick;
        const maxLookback = tickRate * DETECTION.maxLookback; // Only look back N seconds (direct engagement)
        
        // Find the earliest shot within the short window
        for (let i = shots.length - 1; i >= 0; i--) {
          const shotTick = shots[i];
          if (currentTick - shotTick > maxLookback) break;
          firstShotTick = shotTick; // Keep going back to find the earliest
        }
      }
      
      const kill = {
        tick: demoFile.currentTick,
        attacker: {
          name: attacker.name,
          steamId: attackerSteamId,
          team: attacker.teamNumber,
        },
        victim: {
          name: victim.name,
          steamId: victim.steam64Id?.toString() || null,
          team: victim.teamNumber,
        },
        weapon: e.weapon,
        weaponCategory,
        headshot: e.headshot,
        noscope: e.noscope || false,
        isKnife: weaponCategory === 'knife',
        isHeadshotSeriesWeapon: isHeadshotSeriesWeapon(e.weapon),
        round: rounds.length + 1,
        firstShotTick, // When player started shooting (for speedup timing)
      };

      kills.push(kill);

      // Update alive counts for clutch detection
      if (victim.teamNumber === 3) aliveCT--;
      else if (victim.teamNumber === 2) aliveT--;

      // Track kills by clutch player (if clutch situation exists)
      if (currentRound && currentRound.clutchSituation) {
        const clutchPlayerSteamId = currentRound.clutchSituation.player.steamId;
        if (clutchPlayerSteamId && attackerSteamId && clutchPlayerSteamId === attackerSteamId) {
          // Store full kill info for slowmo and speedup detection
          currentRound.clutchSituation.kills.push({
            tick: demoFile.currentTick,
            weapon: e.weapon,
            headshot: e.headshot,
            noscope: e.noscope || false,
            firstShotTick, // When player started shooting
          });
        }
      }

      // Check for clutch situation
      if (currentRound && !currentRound.clutchSituation) {
        if (aliveCT === 1 && aliveT >= 2) {
          // CT is in 1vX situation
          const ctPlayer = demoFile.entities.players.find(p => p && p.isAlive && p.teamNumber === 3);
          if (ctPlayer) {
            currentRound.clutchSituation = {
              player: {
                name: ctPlayer.name,
                steamId: ctPlayer.steam64Id?.toString() || null,
              },
              team: 3,
              enemies: aliveT,
              startTick: demoFile.currentTick,
              kills: [], // Track kills by clutch player (with weapon, headshot, noscope)
            };
          }
        } else if (aliveT === 1 && aliveCT >= 2) {
          // T is in 1vX situation
          const tPlayer = demoFile.entities.players.find(p => p && p.isAlive && p.teamNumber === 2);
          if (tPlayer) {
            currentRound.clutchSituation = {
              player: {
                name: tPlayer.name,
                steamId: tPlayer.steam64Id?.toString() || null,
              },
              team: 2,
              enemies: aliveCT,
              startTick: demoFile.currentTick,
              kills: [], // Track kills by clutch player (with weapon, headshot, noscope)
            };
          }
        }
      }
    });

    demoFile.on('end', (e) => {
      if (e.error) {
        reject(new Error(`Demo parse error: ${e.error}`));
        return;
      }

      // Convert allShotsByPlayer Map to plain object for JSON serialization
      const shotsByPlayer = {};
      for (const [steamId, shots] of allShotsByPlayer) {
        shotsByPlayer[steamId] = shots;
      }
      
      resolve({
        tickRate,
        kills,
        rounds,
        shotsByPlayer, // All weapon_fire events by player steamId
        header: {
          mapName: demoFile.header.mapName,
          playbackTicks: demoFile.header.playbackTicks,
          playbackTime: demoFile.header.playbackTime,
        },
      });
    });

    demoFile.on('error', (error) => {
      reject(error);
    });

    demoFile.parse(buffer);
  });
}

export {
  parseDemo,
  isKnife,
  isHeadshotSeriesWeapon,
  getWeaponCategory,
  KNIFE_WEAPONS,
  SNIPER_WEAPONS,
  SHOTGUN_WEAPONS,
  PISTOL_WEAPONS,
  HEADSHOT_SERIES_WEAPONS,
};
