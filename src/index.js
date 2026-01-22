#!/usr/bin/env node

const { program } = require('commander');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { parseDemo } = require('./parser');
const { detectHighlights } = require('./detector');
const { resolveCollisions } = require('./resolver');
const { recordAllHighlights, postprocessClip } = require('./recorder');
const { mergeClips, cleanupTempFiles, generateSummary } = require('./merger');
const { MusicPlaylist, saveMusicMapping, loadMusicMapping, resyncMusicMapping } = require('./music');

// Default configuration (full config for generation)
const DEFAULT_CONFIG = {
  // Padding settings (in seconds) - adjust these to control clip length
  padding: {
    before: 4,  // seconds before highlight starts
    after: 3,   // seconds after highlight ends
  },
  
  // Speed-up settings for clutches (in seconds)
  speedup: {
    startDelay: 2,          // seconds after highlight start before speedup can begin
    bufferAroundKills: 2,   // seconds to keep at normal speed before/after each kill
    minGapDuration: 4,      // minimum gap duration (seconds) to trigger speed-up
  },
  
  // Slow motion settings
  slowmo: {
    duration: 1,          // seconds for the slowmo ramp-up effect (from peak slowdown back to normal)
    contrast: 1.2,        // peak contrast (1.0 = normal, higher = more punch)
    brightness: 0.05,     // peak brightness boost (0 = none)
    redBoost: 0.2,       // warm/red shift in midtones (0 = none, 0.2 = strong red)
    saturation: 1.1,      // slight saturation boost (1.0 = normal)
  },
  
  // Music overlay settings
  music: {
    folder: './music',    // path to folder with music tracks
    volume: 0.7,          // music volume (0-1)
    gameVolume: 1.0,      // game audio volume (0-1)
    fadeDuration: 2,      // fade in/out duration in seconds (at start and end of each clip)
    enabled: true,        // enable music overlay by default
  },
  
  // Detection settings
  detection: {
    maxDelay: 15,           // seconds between kills for series
    minSeriesKills: 3,      // minimum kills for regular series (2-kill series with knife always qualifies)
    minEnemies: 2,          // minimum enemies for clutch (1vX)
  },
  
  // Kill points (higher = more impressive)
  // Used for sorting and collision resolution when priority is equal
  killPoints: {
    pistol_body: 1,
    rifle_body: 2,
    sniper_body: 3,
    pistol_headshot: 4,
    rifle_headshot: 5,
    sniper_headshot: 6,
    sniper_noscope: 7,
    knife: 8,
  },
  
  // Highlight priorities (higher = more important)
  // Used for collision resolution between same player's highlights
  // Higher priority wins when highlights overlap
  priorities: {
    'clutch': 2,
    'knife': 3,
    'collateral': 4,
    'kill-series': 5,
  },
};

program
  .name('csgo-highlights')
  .description('CLI tool for CS:GO demo highlights')
  .version('1.0.0');

// Analyze command - detect highlights from demo files
program
  .command('analyze')
  .description('Analyze demo files and detect highlights')
  .requiredOption('--demos <path>', 'Path to folder with .dem files')
  .option('--output <path>', 'Output folder for highlights.json', './output')
  .option('--reset-music', 'Reset music mapping (discard existing offsets)')
  .action(analyzeCommand);

// Resync music command - recalculate music times based on manual offsets
program
  .command('resync-music')
  .description('Recalculate music startTime/endTime based on manual offset values in music-mapping.json')
  .option('--mapping <path>', 'Path to music-mapping.json', './output/music-mapping.json')
  .action(resyncMusicCommand);

// Record command - record highlights using HLAE
program
  .command('record')
  .description('Record highlights using HLAE (produces raw clips without effects)')
  .requiredOption('--highlights <path>', 'Path to highlights.json file')
  .requiredOption('--demos <path>', 'Path to folder with .dem files')
  .requiredOption('--hlae <path>', 'Path to HLAE executable (hlae.exe)')
  .requiredOption('--csgo <path>', 'Path to CS:GO installation folder')
  .option('--output <path>', 'Output folder for clips', './output')
  .option('--player <steamId>', 'Filter highlights by player Steam ID')
  .option('--id <highlightId>', 'Record only a specific highlight by ID (for debugging)')
  .action(recordCommand);

// Postprocess command - apply effects to recorded clips
program
  .command('postprocess')
  .description('Apply effects to recorded clips (slowmo, speedup, music, overlay)')
  .requiredOption('--highlights <path>', 'Path to highlights.json file')
  .option('--clips <path>', 'Path to folder containing raw clips', './output/clips')
  .option('--output <path>', 'Output folder for processed clips (default: ./output/clips_processed)')
  .option('--speedup <multiplier>', 'Speed up clutch gaps (e.g., 4 for 4x speed)', parseFloat)
  .option('--overlay', 'Show player name and highlight type overlay (fade in/out)')
  .option('--slowmo <factor>', 'Slow motion on last kill if headshot/noscope (e.g., 0.5 for half speed)', parseFloat)
  .option('--music <folder>', 'Path to music folder (default: ./music)')
  .option('--music-volume <percent>', 'Music volume 0-100 (default: 70)', parseFloat)
  .option('--no-music', 'Disable music overlay')
  .option('--force', 'Re-process all clips even if already processed')
  .option('--id <highlightId>', 'Process only a specific highlight by ID')
  .action(postprocessCommand);

// Merge command - merge recorded clips into a single video
program
  .command('merge')
  .description('Merge recorded clips into a single video using FFmpeg')
  .requiredOption('--clips <path>', 'Path to folder containing clip files (.mp4)')
  .option('--output <path>', 'Output path for final video', './output/highlights_final.mp4')
  .option('--cleanup', 'Delete individual clips after merging')
  .option('--transition <duration>', 'Add fade in/out transitions (duration in seconds)', parseFloat)
  .action(mergeCommand);

// Compress command - compress a video to reduce file size
program
  .command('compress')
  .description('Compress a video file to reduce file size')
  .requiredOption('--input <path>', 'Path to input video file')
  .option('--power <level>', 'Compression power 1-10 (1=light, 10=maximum)', '5')
  .option('--output <path>', 'Output path for compressed video')
  .action(compressCommand);

// Player kills command - show all kills by a player in a demo
program
  .command('player-kills')
  .description('Show all kills by a player in a demo file')
  .requiredOption('--demo <path>', 'Path to demo file (.dem)')
  .requiredOption('--steamid <id>', 'Player Steam ID (64-bit format)')
  .action(playerKillsCommand);

program.parse(process.argv);

async function analyzeCommand(options) {
  const demosPath = path.resolve(options.demos);
  const outputPath = path.resolve(options.output);
  const resetMusic = options.resetMusic || false;
  
  // Validate demos folder exists
  if (!fs.existsSync(demosPath)) {
    console.error(`Error: Demos folder not found: ${demosPath}`);
    process.exit(1);
  }

  // Find all .dem files
  const demFiles = fs.readdirSync(demosPath)
    .filter(file => file.endsWith('.dem'))
    .map(file => path.join(demosPath, file));

  if (demFiles.length === 0) {
    console.error(`Error: No .dem files found in: ${demosPath}`);
    process.exit(1);
  }

  console.log(`Found ${demFiles.length} demo file(s)`);
  console.log('Config:', DEFAULT_CONFIG.detection);

  const results = {
    generatedAt: new Date().toISOString(),
    config: DEFAULT_CONFIG,
    demos: [],
    summary: {
      totalHighlights: 0,
      totalDurationSeconds: 0,
      byType: {
        'kill-series': 0,
        'collateral': 0,
        'knife': 0,
        'clutch': 0,
      },
    },
  };

  // Process each demo file
  for (const demoFile of demFiles) {
    const fileName = path.basename(demoFile);
    console.log(`\nProcessing: ${fileName}`);

    try {
      // Parse demo and extract events
      const demoData = await parseDemo(demoFile);
      console.log(`  Tick rate: ${demoData.tickRate}`);
      console.log(`  Total kills: ${demoData.kills.length}`);
      console.log(`  Total rounds: ${demoData.rounds.length}`);

      // Detect highlights
      let highlights = detectHighlights(demoData, DEFAULT_CONFIG);
      console.log(`  Raw highlights found: ${highlights.length}`);

      // Resolve collisions
      highlights = resolveCollisions(highlights);
      console.log(`  After collision resolution: ${highlights.length}`);

      // Add demo file reference, duration, and playback info to each highlight
      highlights = highlights.map(h => {
        const tickRate = demoData.tickRate;
        
        // Get the highlight's tick range
        let startTick, endTick;
        if (h.tick !== undefined) {
          // Single-tick highlights (knife, collateral)
          startTick = h.tick;
          endTick = h.tick;
        } else {
          // Range highlights (kill-series, clutch)
          startTick = h.startTick;
          endTick = h.endTick;
        }
        
        // Generate unique ID based on highlight properties (stable across re-runs)
        const idSource = `${fileName}|${h.player.steamId}|${h.type}|${startTick}|${endTick}`;
        const id = crypto.createHash('sha256').update(idSource).digest('hex').substring(0, 12);
        
        // Calculate duration in seconds (without padding)
        const durationSeconds = (endTick - startTick) / tickRate;
        
        // Calculate playback ticks with padding
        const paddingBefore = DEFAULT_CONFIG.padding.before;
        const paddingAfter = DEFAULT_CONFIG.padding.after;
        const paddingBeforeTicks = Math.round(paddingBefore * tickRate);
        const paddingAfterTicks = Math.round(paddingAfter * tickRate);
        const playbackStartTick = Math.max(0, startTick - paddingBeforeTicks);
        
        // Calculate playback end tick, capped at round end
        let playbackEndTick = endTick + paddingAfterTicks;
        
        // Find the round that contains this highlight
        const containingRound = demoData.rounds.find(r => 
          r.startTick <= endTick && r.endTick && r.endTick >= endTick
        );
        
        // Find the first round (to handle warmup/pre-game highlights)
        const firstRound = demoData.rounds[0];
        
        // Cap playback at round end + 2 second buffer, but NEVER show next round
        const roundEndBuffer = Math.round(2 * tickRate); // 2 seconds after round end
        
        // Find next round to ensure we NEVER show new round visuals
        const roundIndex = containingRound ? demoData.rounds.indexOf(containingRound) : -1;
        const nextRound = roundIndex >= 0 ? demoData.rounds[roundIndex + 1] : null;
        const lastRound = demoData.rounds[demoData.rounds.length - 1];
        
        if (containingRound && containingRound.endTick) {
          // Cap at round end + buffer
          let cappedEnd = containingRound.endTick + roundEndBuffer;
          
          // Also cap at next round start to NEVER show new round
          if (nextRound && nextRound.startTick) {
            cappedEnd = Math.min(cappedEnd, nextRound.startTick);
          }
          
          playbackEndTick = Math.min(playbackEndTick, cappedEnd);
        }
        
        // Also cap at demo end (last round's end + buffer)
        if (lastRound && lastRound.endTick) {
          playbackEndTick = Math.min(playbackEndTick, lastRound.endTick + roundEndBuffer);
        }
        
        // Handle first round (before Round 1's startTick in demo data)
        if (!containingRound && firstRound && endTick < firstRound.startTick) {
          // Use minimal padding after last kill, capped at Round 1 start
          const minimalPadding = Math.round(2 * tickRate); // 2 seconds after last kill
          playbackEndTick = Math.min(endTick + minimalPadding, firstRound.startTick);
        }
        
        // Calculate total playback duration
        const playbackDurationSeconds = (playbackEndTick - playbackStartTick) / tickRate;
        
        // Calculate speed-up segments for clutches and kill-series (gaps between action)
        let speedupSegments = null;
        
        // Get kills with timing info (both clutches and kill-series now have kills array)
        if ((h.type === 'clutch' || h.type === 'kill-series') && h.kills && h.kills.length > 0) {
          const startDelaySeconds = DEFAULT_CONFIG.speedup.startDelay;
          const bufferSeconds = DEFAULT_CONFIG.speedup.bufferAroundKills;
          const minGapSeconds = DEFAULT_CONFIG.speedup.minGapDuration;
          const startDelayTicks = Math.round(startDelaySeconds * tickRate);
          const bufferTicks = Math.round(bufferSeconds * tickRate);
          const minGapTicks = Math.round(minGapSeconds * tickRate);
          speedupSegments = [];
          
          // Get ALL shots by this player within playback range
          const playerSteamId = h.player.steamId;
          const allPlayerShots = (demoData.shotsByPlayer && playerSteamId && demoData.shotsByPlayer[playerSteamId]) 
            ? demoData.shotsByPlayer[playerSteamId].filter(tick => tick >= playbackStartTick && tick <= playbackEndTick)
            : [];
          
          // Combine shots with kill ticks (for knife kills that don't have weapon_fire events)
          // This ensures knife kills and other melee attacks are also action points
          const killTicks = h.kills.map(k => k.tick);
          const allActionTicks = [...allPlayerShots, ...killTicks].sort((a, b) => a - b);
          
          // Remove duplicates (kills that also have shots)
          const uniqueActionTicks = allActionTicks.filter((tick, i, arr) => 
            i === 0 || tick !== arr[i - 1]
          );
          
          // Group consecutive action ticks into "action periods"
          // Ticks within 1 second of each other are grouped together
          const actionGroupGap = tickRate * 1; // 1 second gap to consider separate periods
          const actionPeriods = [];
          
          if (uniqueActionTicks.length > 0) {
            let periodStart = uniqueActionTicks[0];
            let periodEnd = uniqueActionTicks[0];
            
            for (let i = 1; i < uniqueActionTicks.length; i++) {
              const tick = uniqueActionTicks[i];
              if (tick - periodEnd <= actionGroupGap) {
                // Continue current period
                periodEnd = tick;
              } else {
                // End current period, start new one
                actionPeriods.push({ start: periodStart, end: periodEnd });
                periodStart = tick;
                periodEnd = tick;
              }
            }
            // Add final period
            actionPeriods.push({ start: periodStart, end: periodEnd });
          }
          
          // Build action points from action periods (with buffer)
          const actionPoints = actionPeriods.map(period => ({
            startAction: period.start - bufferTicks,  // Stop speedup before action starts
            endAction: period.end + bufferTicks,      // Resume speedup after action ends
          }));
          
          // Find gaps between action moments
          // Speedup can only start after startDelay from highlight beginning
          let currentPos = playbackStartTick + startDelayTicks;
          
          for (const action of actionPoints) {
            // Speedup segment: from current position to before action starts
            const segmentEnd = action.startAction;
            
            // Only create segment if it's after the start delay and long enough
            if (segmentEnd > currentPos && segmentEnd - currentPos >= minGapTicks) {
              speedupSegments.push({
                startTick: currentPos,
                endTick: segmentEnd,
                durationTicks: segmentEnd - currentPos,
                durationSeconds: Math.round((segmentEnd - currentPos) / tickRate * 100) / 100,
              });
            }
            
            // Move position to after this action (but not before the start delay point)
            currentPos = Math.max(action.endAction, playbackStartTick + startDelayTicks);
          }
          
          // Final segment: from last action to end
          if (playbackEndTick - currentPos >= minGapTicks) {
            speedupSegments.push({
              startTick: currentPos,
              endTick: playbackEndTick,
              durationTicks: playbackEndTick - currentPos,
              durationSeconds: Math.round((playbackEndTick - currentPos) / tickRate * 100) / 100,
            });
          }
          
          // If no meaningful gaps, set to null
          if (speedupSegments.length === 0) {
            speedupSegments = null;
          }
        }
        
        // Detect slow motion moment: find the LAST headshot/noscope kill in the series
        // Example: [body, headshot, body] -> slowmo on the headshot
        // Impact style: instant slowdown at kill, then gradual ramp back to normal
        // Works for kill-series, clutches, and collaterals
        let slowmotion = null;
        if ((h.type === 'kill-series' || h.type === 'clutch' || h.type === 'collateral') && h.kills && h.kills.length > 0) {
          // For collaterals, ALWAYS apply slowmo (collaterals are always impressive)
          // For series/clutch, check if last kill is headshot or noscope
          let qualifyingKill = null;
          
          if (h.type === 'collateral') {
            // Collaterals always get slowmo - use first kill (all same tick anyway)
            qualifyingKill = h.kills[0];
          } else {
            // For series/clutch, find the LAST headshot/noscope kill (iterate from end)
            // Example: [body, headshot, body] -> slowmo on the headshot (index 1)
            for (let i = h.kills.length - 1; i >= 0; i--) {
              const kill = h.kills[i];
              if (kill.headshot === true || kill.noscope === true) {
                qualifyingKill = kill;
                break;
              }
            }
          }
          
          if (qualifyingKill) {
            // Slow motion starts AT the kill and ramps back to normal
            const slowmoDuration = DEFAULT_CONFIG.slowmo.duration;
            const slowmoStartTick = qualifyingKill.tick; // Start exactly at kill moment
            const slowmoEndTick = qualifyingKill.tick + Math.round(slowmoDuration * tickRate);
            
            slowmotion = {
              tick: qualifyingKill.tick,
              startTick: Math.max(slowmoStartTick, playbackStartTick),
              endTick: Math.min(slowmoEndTick, playbackEndTick),
              durationSeconds: slowmoDuration,
              reason: h.type === 'collateral' ? 'collateral' : (qualifyingKill.noscope ? 'noscope' : 'headshot'),
              weapon: qualifyingKill.weapon,
              // Visual effects at peak (fade out with slowmo)
              contrast: DEFAULT_CONFIG.slowmo.contrast,
              brightness: DEFAULT_CONFIG.slowmo.brightness,
              redBoost: DEFAULT_CONFIG.slowmo.redBoost,
              saturation: DEFAULT_CONFIG.slowmo.saturation,
            };
          }
        }
        
        return {
          id,
          ...h,
          demoFile: fileName,
          durationSeconds: Math.round(durationSeconds * 100) / 100,
          playback: {
            startTick: playbackStartTick,
            endTick: playbackEndTick,
            durationSeconds: Math.round(playbackDurationSeconds * 100) / 100,
            paddingBefore: paddingBefore,
            paddingAfter: paddingAfter,
            speedupSegments, // Segments to speed up (gaps between kills)
            slowmotion, // Slow motion moment for impressive last kill
          },
        };
      });

      // Add to results
      results.demos.push({
        file: fileName,
        tickRate: demoData.tickRate,
        highlights,
      });

      // Update summary
      results.summary.totalHighlights += highlights.length;
      for (const h of highlights) {
        results.summary.byType[h.type]++;
        results.summary.totalDurationSeconds += h.playback.durationSeconds;
      }
      // Round total duration
      results.summary.totalDurationSeconds = Math.round(results.summary.totalDurationSeconds * 100) / 100;
    } catch (error) {
      console.error(`  Error processing ${fileName}: ${error.message}`);
      // Continue with other demos
    }
  }

  // Ensure output directory exists
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }

  // Write results
  const outputFile = path.join(outputPath, 'highlights.json');
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(`\nResults written to: ${outputFile}`);
  console.log(`Total highlights: ${results.summary.totalHighlights}`);
  console.log('By type:', results.summary.byType);

  // Generate music mapping if music folder exists
  const musicFolder = path.resolve(DEFAULT_CONFIG.music.folder);
  if (fs.existsSync(musicFolder) && DEFAULT_CONFIG.music.enabled) {
    console.log('\n--- Music Mapping ---');
    try {
      const playlist = new MusicPlaylist(musicFolder);
      await playlist.analyze();

      // Collect all highlights from all demos with their tickRate
      const allHighlights = [];
      let commonTickRate = 128;
      
      for (const demo of results.demos) {
        if (demo.highlights) {
          commonTickRate = demo.tickRate || 128;
          for (const h of demo.highlights) {
            allHighlights.push(h);
          }
        }
      }

      if (allHighlights.length > 0) {
        const musicMappingFile = path.join(outputPath, 'music-mapping.json');
        
        // Load existing mapping to preserve offsets (unless --reset-music is used)
        let existingOffsets = {};
        if (!resetMusic && fs.existsSync(musicMappingFile)) {
          try {
            const existingMapping = loadMusicMapping(musicMappingFile);
            if (existingMapping && existingMapping.clips) {
              for (const [clipId, clipData] of Object.entries(existingMapping.clips)) {
                if (clipData.offset && clipData.offset !== 0) {
                  existingOffsets[clipId] = clipData.offset;
                }
              }
              if (Object.keys(existingOffsets).length > 0) {
                console.log(`  Preserving ${Object.keys(existingOffsets).length} existing offset(s)`);
              }
            }
          } catch (e) {
            // Ignore errors loading existing mapping
          }
        }
        
        let musicMapping = playlist.generateMapping(allHighlights, commonTickRate);
        
        // Restore preserved offsets to new mapping
        let hasOffsets = false;
        for (const [clipId, offset] of Object.entries(existingOffsets)) {
          if (musicMapping.clips[clipId]) {
            musicMapping.clips[clipId].offset = offset;
            hasOffsets = true;
          }
        }
        
        // If there are offsets, recalculate startTime/endTime to account for them
        if (hasOffsets) {
          console.log(`  Recalculating music times with preserved offsets...`);
          musicMapping = resyncMusicMapping(musicMapping);
        }
        
        saveMusicMapping(musicMappingFile, musicMapping);
        console.log(`  Music mapping written to: ${musicMappingFile}`);
        console.log(`  Mapped ${Object.keys(musicMapping.clips).length} clips to music`);
        if (resetMusic) {
          console.log(`  Offsets reset (--reset-music flag used)`);
        } else {
          console.log(`  Tip: Add "offset" field to any clip to shift its music timing, then run 'resync-music'`);
        }
      } else {
        console.log('  No highlights to map music to');
      }
    } catch (error) {
      console.error(`  Music mapping error: ${error.message}`);
      console.log('  Continuing without music mapping...');
    }
  } else if (!fs.existsSync(musicFolder)) {
    console.log(`\nNote: Music folder not found (${musicFolder}). Skipping music mapping.`);
    console.log('  Create a "music" folder with audio files to enable music overlay.');
  }
}

/**
 * Resync music command - recalculate music times based on offsets
 */
async function resyncMusicCommand(options) {
  const mappingPath = path.resolve(options.mapping);
  
  console.log('\n=== Resync Music Mapping ===\n');
  
  // Check if mapping file exists
  if (!fs.existsSync(mappingPath)) {
    console.error(`Error: Music mapping file not found: ${mappingPath}`);
    console.log('  Run "analyze" command first to generate music-mapping.json');
    process.exit(1);
  }
  
  // Load mapping
  const mapping = loadMusicMapping(mappingPath);
  if (!mapping) {
    console.error('Error: Failed to load music mapping');
    process.exit(1);
  }
  
  const clipCount = Object.keys(mapping.clips).length;
  console.log(`Loaded ${clipCount} clips from mapping`);
  
  // Count clips with non-zero offsets
  const clipsWithOffsets = Object.entries(mapping.clips)
    .filter(([id, clip]) => clip.offset && clip.offset !== 0);
  
  if (clipsWithOffsets.length === 0) {
    console.log('\nNo offsets found. Add "offset" field to clips to shift their music timing.');
    console.log('Example: "offset": 10 will shift music 10 seconds forward');
    console.log('         "offset": -5 will shift music 5 seconds backward');
    return;
  }
  
  console.log(`\nClips with offsets:`);
  for (const [id, clip] of clipsWithOffsets) {
    const sign = clip.offset > 0 ? '+' : '';
    console.log(`  ${id}: ${sign}${clip.offset}s`);
  }
  
  // Resync mapping
  console.log('\nRecalculating music times...');
  
  try {
    const updatedMapping = resyncMusicMapping(mapping);
    
    // Save updated mapping
    saveMusicMapping(mappingPath, updatedMapping);
    
    console.log('\nMusic mapping updated successfully!');
    console.log(`\nUpdated times:`);
    
    for (const [id, clip] of Object.entries(updatedMapping.clips)) {
      console.log(`  ${id}: ${clip.startTime} - ${clip.endTime} (${clip.trackFilename})`);
    }
  } catch (error) {
    console.error(`\nError: ${error.message}`);
    process.exit(1);
  }
}

async function recordCommand(options) {
  const highlightsPath = path.resolve(options.highlights);
  const demosPath = path.resolve(options.demos);
  const hlaePath = path.resolve(options.hlae);
  const csgoPath = path.resolve(options.csgo);
  const outputPath = path.resolve(options.output);
  const playerFilter = options.player || null;
  const idFilter = options.id || null;

  // Validate highlights.json exists
  if (!fs.existsSync(highlightsPath)) {
    console.error(`Error: Highlights file not found: ${highlightsPath}`);
    process.exit(1);
  }

  // Validate demos folder exists
  if (!fs.existsSync(demosPath)) {
    console.error(`Error: Demos folder not found: ${demosPath}`);
    process.exit(1);
  }

  // Validate HLAE executable exists
  if (!fs.existsSync(hlaePath)) {
    console.error(`Error: HLAE executable not found: ${hlaePath}`);
    process.exit(1);
  }

  // Validate CS:GO folder exists
  if (!fs.existsSync(csgoPath)) {
    console.error(`Error: CS:GO folder not found: ${csgoPath}`);
    process.exit(1);
  }

  // Parse highlights.json
  let highlightsData;
  try {
    const content = fs.readFileSync(highlightsPath, 'utf-8');
    highlightsData = JSON.parse(content);
  } catch (err) {
    console.error(`Error: Failed to parse highlights.json: ${err.message}`);
    process.exit(1);
  }

  // Count total highlights (with filters)
  let totalHighlights = 0;
  for (const demo of highlightsData.demos) {
    for (const highlight of demo.highlights) {
      const matchesPlayer = !playerFilter || highlight.player.steamId === playerFilter;
      const matchesId = !idFilter || highlight.id === idFilter;
      if (matchesPlayer && matchesId) {
        totalHighlights++;
      }
    }
  }

  if (totalHighlights === 0) {
    console.error('Error: No highlights found to record');
    if (playerFilter) {
      console.error(`  (filtered by player: ${playerFilter})`);
    }
    if (idFilter) {
      console.error(`  (filtered by ID: ${idFilter})`);
    }
    process.exit(1);
  }

  console.log('CS:GO Highlights Recorder');
  console.log('=========================');
  console.log(`Highlights file: ${highlightsPath}`);
  console.log(`Demos folder: ${demosPath}`);
  console.log(`HLAE path: ${hlaePath}`);
  console.log(`CS:GO path: ${csgoPath}`);
  console.log(`Output folder: ${outputPath}`);
  console.log(`Total highlights to record: ${totalHighlights}`);
  if (playerFilter) {
    console.log(`Filtering by player: ${playerFilter}`);
  }
  if (idFilter) {
    console.log(`Filtering by ID: ${idFilter}`);
  }

  // Ensure output directory exists
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }

  try {
    // Record all highlights (raw, no effects)
    const recordedClips = await recordAllHighlights({
      highlightsData,
      demosPath,
      hlaePath,
      csgoPath,
      outputPath,
      playerFilter,
      idFilter,
    });

    if (recordedClips.length === 0) {
      console.error('\nError: No clips were recorded successfully');
      process.exit(1);
    }

    console.log('\n=========================');
    console.log('Recording Complete!');
    console.log('=========================');
    console.log(`Recorded ${recordedClips.length} raw clips`);
    console.log(`Clips saved to: ${path.join(outputPath, 'clips')}`);
    console.log(`\nNext steps:`);
    console.log(`  1. Post-process clips: node src/index.js postprocess --highlights "${highlightsPath}" --clips "${path.join(outputPath, 'clips')}" --speedup 4 --overlay --slowmo 0.5`);
    console.log(`  2. Merge clips: node src/index.js merge --clips "${path.join(outputPath, 'clips')}"`);

    // Cleanup temp files
    cleanupTempFiles(outputPath);

  } catch (err) {
    console.error(`\nError during recording: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Post-process command - apply effects to recorded clips
 */
async function postprocessCommand(options) {
  const highlightsPath = path.resolve(options.highlights);
  const clipsPath = path.resolve(options.clips);
  const outputPath = options.output 
    ? path.resolve(options.output) 
    : path.join(path.dirname(clipsPath), 'clips_processed');
  const speedupMultiplier = options.speedup || null;
  const showOverlay = options.overlay || false;
  const slowmoFactor = options.slowmo || null;
  const forceReprocess = options.force || false;
  const filterById = options.id || null;
  
  // Music options
  const musicEnabled = options.music !== false;
  const musicFolder = options.music ? path.resolve(options.music) : path.resolve(DEFAULT_CONFIG.music.folder);
  const musicVolume = options.musicVolume !== undefined 
    ? options.musicVolume / 100 
    : DEFAULT_CONFIG.music.volume;

  // Validate highlights.json exists
  if (!fs.existsSync(highlightsPath)) {
    console.error(`Error: Highlights file not found: ${highlightsPath}`);
    process.exit(1);
  }

  // Validate clips folder exists
  if (!fs.existsSync(clipsPath)) {
    console.error(`Error: Clips folder not found: ${clipsPath}`);
    process.exit(1);
  }

  // Create output folder if it doesn't exist
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }

  // Parse highlights.json
  let highlightsData;
  try {
    const content = fs.readFileSync(highlightsPath, 'utf-8');
    highlightsData = JSON.parse(content);
  } catch (err) {
    console.error(`Error: Failed to parse highlights.json: ${err.message}`);
    process.exit(1);
  }

  // Load postprocess status (to skip already processed clips)
  // Always load existing status - --force only affects whether we reprocess, not whether we keep history
  const statusPath = path.join(outputPath, 'postprocess-status.json');
  let processedStatus = {};
  if (fs.existsSync(statusPath)) {
    try {
      processedStatus = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    } catch (e) {
      processedStatus = {};
    }
  }

  // Load music mapping if music is enabled
  let musicMapping = null;
  if (musicEnabled && fs.existsSync(musicFolder)) {
    const musicMappingPath = path.join(path.dirname(highlightsPath), 'music-mapping.json');
    
    if (fs.existsSync(musicMappingPath)) {
      musicMapping = loadMusicMapping(musicMappingPath);
    }
  }

  // Find all .mp4 files in clips folder (sorted numerically by clip index)
  const clipFiles = fs.readdirSync(clipsPath)
    .filter(f => f.endsWith('.mp4'))
    .sort((a, b) => {
      const numA = parseInt(a.split('-')[0], 10) || 0;
      const numB = parseInt(b.split('-')[0], 10) || 0;
      return numA - numB;
    });

  if (clipFiles.length === 0) {
    console.error('Error: No clip files found in folder');
    process.exit(1);
  }

  // Build highlight ID to highlight mapping
  const highlightMap = {};
  for (const demo of highlightsData.demos) {
    for (const highlight of demo.highlights) {
      highlightMap[highlight.id] = {
        ...highlight,
        demoFile: demo.file,
        tickRate: demo.tickRate,
      };
    }
  }

  console.log('CS:GO Highlights Post-Processor');
  console.log('================================');
  console.log(`Source clips: ${clipsPath}`);
  console.log(`Output folder: ${outputPath}`);
  console.log(`Total clips: ${clipFiles.length}`);
  if (speedupMultiplier) console.log(`Speedup: ${speedupMultiplier}x`);
  if (showOverlay) console.log(`Overlay: enabled`);
  if (slowmoFactor) console.log(`Slowmo: ${slowmoFactor}x`);
  if (musicMapping) console.log(`Music: enabled (${Object.keys(musicMapping.clips).length} clips mapped)`);
  if (forceReprocess) console.log(`Force: re-processing all clips`);
  if (filterById) console.log(`Filter: processing only ID ${filterById}`);

  let processed = 0;
  let skipped = 0;

  for (const clipFile of clipFiles) {
    // Extract highlight ID from filename (e.g., "1-de_dust2-abc123def456.mp4")
    const match = clipFile.match(/-([a-f0-9]{12})\.mp4$/i);
    if (!match) {
      console.log(`  Skipping ${clipFile} (can't extract highlight ID)`);
      skipped++;
      continue;
    }

    const highlightId = match[1];
    
    // Filter by ID if specified
    if (filterById && highlightId !== filterById) {
      continue; // Skip silently - not the clip we're looking for
    }
    
    const highlight = highlightMap[highlightId];

    if (!highlight) {
      console.log(`  Skipping ${clipFile} (highlight ID not found in highlights.json)`);
      skipped++;
      continue;
    }

    // Check if already processed (same settings)
    const settingsHash = JSON.stringify({
      speedup: speedupMultiplier,
      overlay: showOverlay,
      slowmo: slowmoFactor,
      music: musicEnabled,
    });

    const outputClipPath = path.join(outputPath, clipFile);
    
    if (processedStatus[highlightId] === settingsHash && fs.existsSync(outputClipPath) && !forceReprocess) {
      console.log(`  Skipping ${clipFile} (already processed)`);
      skipped++;
      continue;
    }

    const sourceClipPath = path.join(clipsPath, clipFile);
    console.log(`\n  Processing ${clipFile}...`);

    try {
      // Copy source clip to output folder first (preserve original)
      console.log(`    Copying to output folder...`);
      fs.copyFileSync(sourceClipPath, outputClipPath);
      
      // Get music info for this highlight
      const musicInfo = musicMapping && musicMapping.clips[highlightId]
        ? musicMapping.clips[highlightId]
        : null;

      await postprocessClip({
        clipPath: outputClipPath,  // Process the copy, not the original
        highlight,
        speedupMultiplier,
        showOverlay,
        slowmoFactor,
        musicInfo,
        musicVolume,
        gameVolume: DEFAULT_CONFIG.music.gameVolume,
        musicFadeDuration: DEFAULT_CONFIG.music.fadeDuration,
      });

      // Mark as processed and save status immediately (so interrupts don't lose progress)
      processedStatus[highlightId] = settingsHash;
      fs.writeFileSync(statusPath, JSON.stringify(processedStatus, null, 2));
      processed++;
      console.log(`    Done!`);
    } catch (err) {
      console.error(`    Error: ${err.message}`);
      // Remove failed output file
      try {
        if (fs.existsSync(outputClipPath)) fs.unlinkSync(outputClipPath);
      } catch (e) { /* ignore */ }
    }
  }

  // Final status save (in case loop completed normally)
  fs.writeFileSync(statusPath, JSON.stringify(processedStatus, null, 2));

  console.log('\n================================');
  console.log('Post-Processing Complete!');
  console.log('================================');
  console.log(`Processed: ${processed} clips`);
  console.log(`Skipped: ${skipped} clips`);
  console.log(`Output folder: ${outputPath}`);
  console.log(`Status saved to: ${statusPath}`);
  console.log(`\nOriginal clips preserved in: ${clipsPath}`);
  console.log(`\nTo merge processed clips into a single video, run:`);
  console.log(`  node src/index.js merge --clips "${outputPath}"`);
}

async function mergeCommand(options) {
  const clipsPath = path.resolve(options.clips);
  const outputPath = path.resolve(options.output);
  const shouldCleanup = options.cleanup || false;
  const transitionDuration = options.transition || null;

  // Validate clips folder exists
  if (!fs.existsSync(clipsPath)) {
    console.error(`Error: Clips folder not found: ${clipsPath}`);
    process.exit(1);
  }

  // Find all .mp4 files in the clips folder (sorted numerically by clip index)
  const clipFiles = fs.readdirSync(clipsPath)
    .filter(file => file.endsWith('.mp4'))
    .sort((a, b) => {
      const numA = parseInt(a.split('-')[0], 10) || 0;
      const numB = parseInt(b.split('-')[0], 10) || 0;
      return numA - numB;
    })
    .map(file => path.join(clipsPath, file));

  if (clipFiles.length === 0) {
    console.error(`Error: No .mp4 files found in: ${clipsPath}`);
    process.exit(1);
  }

  console.log('CS:GO Highlights Merger');
  console.log('=======================');
  console.log(`Clips folder: ${clipsPath}`);
  console.log(`Output file: ${outputPath}`);
  console.log(`Found ${clipFiles.length} clips to merge`);
  if (transitionDuration) {
    console.log(`Transitions: ${transitionDuration}s fade in/out`);
  }
  if (shouldCleanup) {
    console.log('Cleanup: Will delete clips after merging');
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    await mergeClips({
      clipPaths: clipFiles,
      outputPath,
      cleanupClips: shouldCleanup,
      transitionDuration,
    });

    // Generate and display summary
    const summary = await generateSummary(outputPath, clipFiles.length);

    console.log('\n=======================');
    console.log('Merge Complete!');
    console.log('=======================');
    console.log(`Final video: ${summary.outputFile}`);
    console.log(`Total clips: ${summary.clipCount}`);
    console.log(`Duration: ${summary.durationFormatted}`);
    console.log(`File size: ${summary.fileSizeMB} MB`);

  } catch (err) {
    console.error(`\nError during merging: ${err.message}`);
    process.exit(1);
  }
}

async function compressCommand(options) {
  const inputPath = path.resolve(options.input);
  const power = parseInt(options.power, 10);
  
  // Validate input file exists
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }
  
  // Validate power level
  if (isNaN(power) || power < 1 || power > 10) {
    console.error('Error: Compression power must be between 1 and 10');
    process.exit(1);
  }
  
  // Generate output path if not specified
  let outputPath;
  if (options.output) {
    outputPath = path.resolve(options.output);
  } else {
    const inputDir = path.dirname(inputPath);
    const inputName = path.basename(inputPath, path.extname(inputPath));
    outputPath = path.join(inputDir, `${inputName}_compressed.mp4`);
  }
  
  // Map power (1-10) to CRF value (18-36)
  // Power 1 = CRF 18 (minimal compression, high quality)
  // Power 10 = CRF 36 (maximum compression, lower quality)
  const crf = 18 + Math.round((power - 1) * (36 - 18) / 9);
  
  // Get input file size
  const inputStats = fs.statSync(inputPath);
  const inputSizeMB = (inputStats.size / (1024 * 1024)).toFixed(2);
  
  console.log('CS:GO Highlights Compressor');
  console.log('===========================');
  console.log(`Input: ${inputPath}`);
  console.log(`Output: ${outputPath}`);
  console.log(`Power: ${power}/10 (CRF: ${crf})`);
  console.log(`Input size: ${inputSizeMB} MB`);
  console.log('');
  console.log('Compressing video...');
  
  try {
    await runFfmpegCompress(inputPath, outputPath, crf);
    
    // Get output file size
    const outputStats = fs.statSync(outputPath);
    const outputSizeMB = (outputStats.size / (1024 * 1024)).toFixed(2);
    const reduction = (((inputStats.size - outputStats.size) / inputStats.size) * 100).toFixed(1);
    
    console.log('\n===========================');
    console.log('Compression Complete!');
    console.log('===========================');
    console.log(`Output: ${outputPath}`);
    console.log(`Original size: ${inputSizeMB} MB`);
    console.log(`Compressed size: ${outputSizeMB} MB`);
    console.log(`Size reduction: ${reduction}%`);
    
  } catch (err) {
    console.error(`\nError during compression: ${err.message}`);
    process.exit(1);
  }
}

function runFfmpegCompress(inputPath, outputPath, crf) {
  const { spawn } = require('child_process');
  
  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-c:v', 'libx264',
      '-crf', crf.toString(),
      '-preset', 'medium',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-y',
      outputPath,
    ];
    
    const ffmpeg = spawn('ffmpeg', args, {
      stdio: 'pipe',
      windowsHide: true,
    });
    
    let errorOutput = '';
    let lastProgress = '';
    
    ffmpeg.stderr.on('data', (data) => {
      const output = data.toString();
      errorOutput += output;
      
      // Extract and display progress
      const timeMatch = output.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
      if (timeMatch && timeMatch[1] !== lastProgress) {
        lastProgress = timeMatch[1];
        process.stdout.write(`\r  Progress: ${lastProgress}`);
      }
    });
    
    ffmpeg.on('close', (code) => {
      process.stdout.write('\n');
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg compression failed with code ${code}`));
      }
    });
    
    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to run FFmpeg: ${err.message}. Make sure FFmpeg is installed and in PATH.`));
    });
  });
}

/**
 * Player kills command - show all kills by a player in a demo
 */
async function playerKillsCommand(options) {
  const demoPath = path.resolve(options.demo);
  const targetSteamId = options.steamid;
  
  // Validate demo file exists
  if (!fs.existsSync(demoPath)) {
    console.error(`Error: Demo file not found: ${demoPath}`);
    process.exit(1);
  }
  
  console.log('CS:GO Player Kills Analyzer');
  console.log('===========================');
  console.log(`Demo: ${path.basename(demoPath)}`);
  console.log(`Steam ID: ${targetSteamId}`);
  console.log('');
  
  try {
    const { DemoFile } = require('demofile');
    const buffer = fs.readFileSync(demoPath);
    const demo = new DemoFile();
    
    const kills = [];
    let tickRate = 128;
    let playerName = null;
    
    demo.on('start', () => {
      if (demo.header.playbackTime > 0) {
        tickRate = Math.round(demo.header.playbackTicks / demo.header.playbackTime);
      }
    });
    
    demo.gameEvents.on('player_death', (e) => {
      const attacker = demo.entities.getByUserId(e.attacker);
      const victim = demo.entities.getByUserId(e.userid);
      
      if (attacker && attacker.steam64Id === targetSteamId) {
        if (!playerName) playerName = attacker.name;
        
        kills.push({
          tick: demo.currentTick,
          victimName: victim ? victim.name : 'unknown',
          weapon: e.weapon,
          headshot: e.headshot,
          noscope: e.noscope || false,
        });
      }
    });
    
    await new Promise((resolve, reject) => {
      demo.on('end', (e) => {
        if (e.error) {
          reject(new Error(`Demo parse error: ${e.error}`));
        } else {
          resolve();
        }
      });
      demo.on('error', reject);
      demo.parse(buffer);
    });
    
    if (kills.length === 0) {
      console.log(`No kills found for Steam ID ${targetSteamId}`);
      console.log('Make sure you are using the 64-bit Steam ID format (e.g., 76561198105978409)');
      return;
    }
    
    console.log(`Player: ${playerName}`);
    console.log(`Tick rate: ${tickRate}`);
    console.log(`Total kills: ${kills.length}`);
    console.log('');
    console.log('# | Tick     | Time     | Gap      | Weapon      | Hit      | Victim');
    console.log('--|----------|----------|----------|-------------|----------|--------');
    
    kills.forEach((k, i) => {
      const timeSec = (k.tick / tickRate).toFixed(1);
      const timeFormatted = formatTime(k.tick / tickRate);
      const prev = i > 0 ? kills[i - 1] : null;
      const gapSec = prev ? ((k.tick - prev.tick) / tickRate).toFixed(2) : '-';
      const gapFormatted = prev ? `${gapSec}s` : '-';
      const hit = k.headshot ? 'HEAD' : 'body';
      const noscope = k.noscope ? ' (ns)' : '';
      
      console.log(
        `${String(i + 1).padStart(2)} | ` +
        `${String(k.tick).padStart(8)} | ` +
        `${timeFormatted.padStart(8)} | ` +
        `${gapFormatted.padStart(8)} | ` +
        `${k.weapon.padEnd(11)} | ` +
        `${(hit + noscope).padEnd(8)} | ` +
        `${k.victimName}`
      );
    });
    
    console.log('');
    
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Format seconds to MM:SS
 */
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
