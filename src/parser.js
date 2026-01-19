const fs = require('fs');
const { DemoFile } = require('demofile');

// Weapon categories for point calculation
const PISTOL_WEAPONS = [
  'glock', 'usp_silencer', 'hkp2000', 'p250', 'tec9', 'fiveseven',
  'cz75a', 'deagle', 'revolver', 'elite',
];

const SNIPER_WEAPONS = [
  'awp', 'ssg08', 'g3sg1', 'scar20',
];

// Everything else that's not pistol/sniper/knife is considered rifle

/**
 * Get weapon category: 'pistol', 'sniper', 'rifle', or 'knife'
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
  if (PISTOL_WEAPONS.includes(normalized)) {
    return 'pistol';
  }
  return 'rifle';
}

// Knife weapon names in CS:GO
const KNIFE_WEAPONS = [
  'knife',
  'knife_t',
  'knife_ct',
  'bayonet',
  'knife_flip',
  'knife_gut',
  'knife_karambit',
  'knife_m9_bayonet',
  'knife_tactical',
  'knife_falchion',
  'knife_survival_bowie',
  'knife_butterfly',
  'knife_push',
  'knife_cord',
  'knife_canis',
  'knife_ursus',
  'knife_gypsy_jackknife',
  'knife_outdoor',
  'knife_stiletto',
  'knife_widowmaker',
  'knife_skeleton',
];

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
    let tickRate = 64; // Default, will be calculated from header
    let matchStarted = false;
    let isWarmup = true;

    // Track alive players per team for clutch detection
    let aliveCT = 0;
    let aliveT = 0;

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
          if (player.team === 3) aliveCT++; // CT
          else if (player.team === 2) aliveT++; // T
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

    // Player death
    demoFile.gameEvents.on('player_death', (e) => {
      const attacker = demoFile.entities.getByUserId(e.attacker);
      const victim = demoFile.entities.getByUserId(e.userid);

      // Skip if no attacker (suicide/world kill)
      if (!attacker || !victim) return;

      // Skip team kills
      if (attacker.team === victim.team) return;

      // Skip warmup kills (heuristic: if match hasn't started and we're in first few rounds)
      if (isWarmup && !matchStarted && rounds.length < 1) return;

      const weaponCategory = getWeaponCategory(e.weapon);
      
      const kill = {
        tick: demoFile.currentTick,
        attacker: {
          name: attacker.name,
          steamId: attacker.steam64Id?.toString() || null,
          team: attacker.team,
        },
        victim: {
          name: victim.name,
          steamId: victim.steam64Id?.toString() || null,
          team: victim.team,
        },
        weapon: e.weapon,
        weaponCategory,
        headshot: e.headshot,
        noscope: e.noscope || false,
        isKnife: weaponCategory === 'knife',
        round: rounds.length + 1,
      };

      kills.push(kill);

      // Update alive counts for clutch detection
      if (victim.team === 3) aliveCT--;
      else if (victim.team === 2) aliveT--;

      // Check for clutch situation
      if (currentRound && !currentRound.clutchSituation) {
        if (aliveCT === 1 && aliveT >= 2) {
          // CT is in 1vX situation
          const ctPlayer = demoFile.entities.players.find(p => p && p.isAlive && p.team === 3);
          if (ctPlayer) {
            currentRound.clutchSituation = {
              player: {
                name: ctPlayer.name,
                odensity: ctPlayer.steam64Id?.toString() || null,
              },
              team: 3,
              enemies: aliveT,
              startTick: demoFile.currentTick,
            };
          }
        } else if (aliveT === 1 && aliveCT >= 2) {
          // T is in 1vX situation
          const tPlayer = demoFile.entities.players.find(p => p && p.isAlive && p.team === 2);
          if (tPlayer) {
            currentRound.clutchSituation = {
              player: {
                name: tPlayer.name,
                odensity: tPlayer.steam64Id?.toString() || null,
              },
              team: 2,
              enemies: aliveCT,
              startTick: demoFile.currentTick,
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

      resolve({
        tickRate,
        kills,
        rounds,
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

module.exports = {
  parseDemo,
  isKnife,
  getWeaponCategory,
  KNIFE_WEAPONS,
  SNIPER_WEAPONS,
  PISTOL_WEAPONS,
};
