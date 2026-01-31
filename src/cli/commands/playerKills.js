/**
 * @fileoverview Player kills command - analyze kills by a specific player
 * 
 * Useful for debugging and manually identifying solo kill ticks.
 * Shows detailed kill timeline with gaps between kills.
 */

import path from 'path';
import fs from 'fs';
import { validateFileExists } from '../validators.js';
import { formatTime } from '../utils/time.js';

/**
 * Main player-kills command handler
 * 
 * @param {Object} options - Command options
 */
async function playerKillsCommand(options) {
  const demoPath = validateFileExists(options.demo, 'Demo file');
  const targetSteamId = options.steamid;
  
  printHeader(demoPath, targetSteamId);
  
  try {
    const { DemoFile } = await import('demofile');
    const buffer = fs.readFileSync(demoPath);
    const demo = new DemoFile();
    
    // Parse demo and collect kills
    const result = await parseDemoForPlayerKills(demo, buffer, targetSteamId);
    
    if (result.kills.length === 0) {
      console.log(`No kills found for Steam ID ${targetSteamId}`);
      console.log('Make sure you are using the 64-bit Steam ID format (e.g., 76561198105978409)');
      return;
    }
    
    // Print results
    printKillsTable(result);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Print command header
 */
function printHeader(demoPath, steamId) {
  console.log('CS:GO Player Kills Analyzer');
  console.log('===========================');
  console.log(`Demo: ${path.basename(demoPath)}`);
  console.log(`Steam ID: ${steamId}`);
  console.log('');
}

/**
 * Parse demo file and extract kills by target player
 * 
 * @param {DemoFile} demo - DemoFile instance
 * @param {Buffer} buffer - Demo file buffer
 * @param {string} targetSteamId - Target player Steam ID
 * @returns {Promise<Object>} Parsed kill data
 */
function parseDemoForPlayerKills(demo, buffer, targetSteamId) {
  return new Promise((resolve, reject) => {
    const kills = [];
    let tickRate = 128;
    let playerName = null;
    let matchStarted = false;
    let roundCount = 0;
    
    // Get tick rate from header
    demo.on('start', () => {
      if (demo.header.playbackTime > 0) {
        tickRate = Math.round(demo.header.playbackTicks / demo.header.playbackTime);
      }
    });
    
    // Detect match start (end of warmup)
    demo.gameEvents.on('round_announce_match_start', () => {
      matchStarted = true;
      roundCount = 1;
    });
    
    demo.gameEvents.on('begin_new_match', () => {
      matchStarted = true;
      roundCount = 1;
    });
    
    demo.gameEvents.on('round_start', () => {
      if (matchStarted) {
        roundCount++;
      }
    });
    
    // Collect kills by target player
    demo.gameEvents.on('player_death', (e) => {
      const attacker = demo.entities.getByUserId(e.attacker);
      const victim = demo.entities.getByUserId(e.userid);
      
      // Skip invalid kills
      if (!attacker || !victim) return;
      if (attacker.teamNumber === victim.teamNumber) return; // Team kill
      if (!matchStarted) return; // Warmup
      
      if (attacker.steam64Id === targetSteamId) {
        if (!playerName) playerName = attacker.name;
        
        const side = attacker.teamNumber === 3 ? 'CT' : 'T';
        
        kills.push({
          tick: demo.currentTick,
          round: roundCount,
          side,
          victimName: victim.name,
          weapon: e.weapon,
          headshot: e.headshot,
          noscope: e.noscope || false,
        });
      }
    });
    
    demo.on('end', (e) => {
      if (e.error) {
        reject(new Error(`Demo parse error: ${e.error}`));
      } else {
        resolve({ kills, tickRate, playerName });
      }
    });
    
    demo.on('error', reject);
    demo.parse(buffer);
  });
}

/**
 * Print kills in a formatted table
 * 
 * @param {Object} result - Parse result with kills, tickRate, playerName
 */
function printKillsTable(result) {
  const { kills, tickRate, playerName } = result;
  
  console.log(`Player: ${playerName}`);
  console.log(`Tick rate: ${tickRate}`);
  console.log(`Total kills: ${kills.length}`);
  console.log('');
  
  // Table header
  console.log(' # | Rnd | Side | Tick     | Time     | Gap      | Weapon      | Hit      | Victim');
  console.log('----|-----|------|----------|----------|----------|-------------|----------|--------');
  
  // Table rows
  kills.forEach((k, i) => {
    const timeFormatted = formatTime(k.tick / tickRate);
    const prev = i > 0 ? kills[i - 1] : null;
    const gapSec = prev ? ((k.tick - prev.tick) / tickRate).toFixed(2) : '-';
    const gapFormatted = prev ? `${gapSec}s` : '-';
    const hit = k.headshot ? 'HEAD' : 'body';
    const noscope = k.noscope ? ' (ns)' : '';
    
    console.log(
      `${String(i + 1).padStart(2)} | ` +
      `${String(k.round).padStart(3)} | ` +
      `${k.side.padStart(4)} | ` +
      `${String(k.tick).padStart(8)} | ` +
      `${timeFormatted.padStart(8)} | ` +
      `${gapFormatted.padStart(8)} | ` +
      `${k.weapon.padEnd(11)} | ` +
      `${(hit + noscope).padEnd(8)} | ` +
      `${k.victimName}`
    );
  });
  
  console.log('');
}

export { playerKillsCommand };
