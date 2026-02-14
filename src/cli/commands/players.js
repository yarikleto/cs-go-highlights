import fs from 'fs';
import path from 'path';
import { parseDemo } from '../../parser.js';

/**
 * Extract player list from a demo file
 */
export async function playersCommand(options) {
  const demoPath = options.demo;
  
  if (!fs.existsSync(demoPath)) {
    console.error(`Demo file not found: ${demoPath}`);
    process.exit(1);
  }

  console.log(`\nExtracting players from: ${path.basename(demoPath)}\n`);

  try {
    const demoData = await parseDemo(demoPath);
    
    // Collect unique players
    const playersMap = new Map();
    
    // From kills
    demoData.kills.forEach(kill => {
      if (kill.attacker && kill.attacker.steamId) {
        playersMap.set(kill.attacker.steamId, {
          name: kill.attacker.name,
          steamId: kill.attacker.steamId,
          team: kill.attackerTeam,
        });
      }
      if (kill.victim && kill.victim.steamId) {
        playersMap.set(kill.victim.steamId, {
          name: kill.victim.name,
          steamId: kill.victim.steamId,
          team: kill.victimTeam,
        });
      }
    });

    const players = Array.from(playersMap.values());
    
    // Sort by team then by name
    players.sort((a, b) => {
      if (a.team !== b.team) {
        return (a.team || '').localeCompare(b.team || '');
      }
      return (a.name || '').localeCompare(b.name || '');
    });

    // Group by team
    const teams = {};
    players.forEach(p => {
      const team = p.team || 'Unknown';
      if (!teams[team]) {
        teams[team] = [];
      }
      teams[team].push(p);
    });

    // Output
    console.log('Players found:');
    console.log('─'.repeat(70));
    
    for (const [team, teamPlayers] of Object.entries(teams)) {
      console.log(`\n${team}:`);
      console.log('─'.repeat(40));
      
      teamPlayers.forEach(p => {
        console.log(`  ${p.name.padEnd(25)} ${p.steamId}`);
      });
    }
    
    console.log('\n' + '─'.repeat(70));
    console.log(`Total: ${players.length} players\n`);

    // Output JSON if requested
    if (options.output) {
      const outputData = {
        demo: path.basename(demoPath),
        players: players.map(p => ({
          name: p.name,
          steamId: p.steamId,
          team: p.team,
        })),
      };
      
      fs.writeFileSync(options.output, JSON.stringify(outputData, null, 2));
      console.log(`Saved to: ${options.output}`);
    }

  } catch (error) {
    console.error('Error parsing demo:', error.message);
    process.exit(1);
  }
}

export default playersCommand;
