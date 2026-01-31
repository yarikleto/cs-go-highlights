import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { parseTime } from './music.js';
import {
  RECORDING,
  ENCODING,
  TIMING,
  SLOWMO,
  VISUAL_EFFECTS,
  MUSIC,
} from './config.js';
import { getHighlights } from './cli/validators.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Track active processes for cleanup on SIGINT/SIGTERM
let activeHlaeProcess = null;
let activeFfmpegProcess = null;
let cleanupCallbacks = [];
let isShuttingDown = false;

/**
 * Registers cleanup handlers for graceful shutdown
 */
function setupSignalHandlers() {
  const cleanup = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    console.log('\n\n  Interrupted! Cleaning up...');
    
    // Kill HLAE process (this will also close CS:GO)
    if (activeHlaeProcess) {
      console.log('    Terminating HLAE...');
      try {
        activeHlaeProcess.kill('SIGTERM');
        // On Windows, also try to kill csgo.exe directly
        if (process.platform === 'win32') {
          try {
            execSync('taskkill /F /IM csgo.exe 2>nul', { stdio: 'ignore' });
          } catch (e) {
            // Ignore - process might not be running
          }
        }
      } catch (e) {
        // Ignore
      }
    }
    
    // Kill FFmpeg process
    if (activeFfmpegProcess) {
      console.log('    Terminating FFmpeg...');
      try {
        activeFfmpegProcess.kill('SIGTERM');
      } catch (e) {
        // Ignore
      }
    }
    
    // Run any registered cleanup callbacks (e.g., removing temp files)
    for (const cb of cleanupCallbacks) {
      try {
        cb();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    
    console.log('    Cleanup complete. Exiting.\n');
    process.exit(1);
  };
  
  // Handle Ctrl+C (SIGINT) and termination (SIGTERM)
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  
  // On Windows, also handle the close event
  if (process.platform === 'win32') {
    process.on('SIGHUP', cleanup);
  }
}

// Initialize signal handlers
setupSignalHandlers();

// Default recording settings (uses centralized config)
const DEFAULT_SETTINGS = {
  width: RECORDING.width,
  height: RECORDING.height,
  framerate: RECORDING.framerate,
  crf: RECORDING.crf,
  preset: RECORDING.preset,
};

/**
 * Records a single highlight using HLAE
 * @param {Object} options Recording options
 * @param {string} options.hlaePath Path to HLAE executable
 * @param {string} options.csgoPath Path to CS:GO installation
 * @param {string} options.demoPath Full path to demo file
 * @param {Object} options.highlight Highlight object from highlights.json
 * @param {string} options.outputPath Output folder for clips
 * @param {number} options.clipIndex Index of this clip (for naming)
 * @returns {Promise<string>} Path to the recorded clip
 */
async function recordHighlight(options) {
  const { hlaePath, csgoPath, demoPath, highlight, outputPath, clipIndex, voiceChat } = options;
  
  // Extract map name from demo file name (e.g., "auto0-20260116-172808-1914328147-de_dust2-WIX.dem" -> "de_dust2")
  const demoFileName = path.basename(demoPath, '.dem');
  const mapMatch = demoFileName.match(/-(de_[a-z0-9_]+|cs_[a-z0-9_]+|ar_[a-z0-9_]+)/i);
  const mapName = mapMatch ? mapMatch[1] : 'unknown';
  
  // Generate clip name: position-mapname-highlightId
  const highlightId = highlight.id || 'noid';
  const clipName = `${clipIndex}-${mapName}-${highlightId}`;
  const clipFolder = path.join(outputPath, 'clips', clipName);
  const clipOutputPath = path.join(outputPath, 'clips', `${clipName}.mp4`);
  
  // Create clip folder for TGA/WAV output
  if (!fs.existsSync(clipFolder)) {
    fs.mkdirSync(clipFolder, { recursive: true });
  }
  
  // Generate CFG content for this recording
  const cfgContent = generateRecordingCfg({
    highlight,
    clipFolder,
    clipName,
    settings: DEFAULT_SETTINGS,
    voiceChat,
  });
  
  // CFG filename (just the name, no path)
  const cfgFileName = `hlae_record_${clipName}.cfg`;
  
  // Copy CFG to CS:GO cfg folder so exec command can find it
  const csgoCfgFolder = path.join(csgoPath, 'csgo', 'cfg');
  const cfgInGamePath = path.join(csgoCfgFolder, cfgFileName);
  
  // Ensure CS:GO cfg folder exists
  if (!fs.existsSync(csgoCfgFolder)) {
    fs.mkdirSync(csgoCfgFolder, { recursive: true });
  }
  
  // Write CFG file to CS:GO cfg folder
  fs.writeFileSync(cfgInGamePath, cfgContent);
  console.log(`    [1/4] CFG file created: ${cfgFileName}`);
  
  // Generate VDM file for tick-accurate demo control
  // VDM file must be next to the demo file with same name
  const vdmContent = generateVdmFile({
    highlight,
    clipFolder,
    cfgFileName,
  });
  
  // VDM path: same as demo but with .vdm extension
  const vdmPath = demoPath.replace(/\.dem$/i, '.vdm');
  
  // Backup existing VDM if present
  let existingVdm = null;
  if (fs.existsSync(vdmPath)) {
    existingVdm = fs.readFileSync(vdmPath);
  }
  
  // Write VDM file
  fs.writeFileSync(vdmPath, vdmContent);
  console.log(`    [2/4] VDM file created (skip to tick ${highlight.playback.startTick - 128}, record ${highlight.playback.startTick}-${highlight.playback.endTick})`);
  console.log(`    [3/4] Launching HLAE + CS:GO... (estimated clip: ${highlight.playback.durationSeconds}s)`);
  console.log(`    Demo path: ${demoPath}`);
  console.log(`    VDM path: ${vdmPath}`);
  
  // Register cleanup callbacks for SIGINT handling
  const cleanupTempFiles = () => {
    try {
      if (fs.existsSync(cfgInGamePath)) {
        fs.unlinkSync(cfgInGamePath);
      }
    } catch (e) { /* ignore */ }
    try {
      if (existingVdm) {
        fs.writeFileSync(vdmPath, existingVdm);
      } else if (fs.existsSync(vdmPath)) {
        fs.unlinkSync(vdmPath);
      }
    } catch (e) { /* ignore */ }
  };
  cleanupCallbacks.push(cleanupTempFiles);
  
  // Launch HLAE with CS:GO and the demo
  try {
    await launchHlaeRecording({
      hlaePath,
      csgoPath,
      demoPath,
      cfgFileName, // Just the filename, not full path
      highlight,
    });
    console.log(`    [3/4] Recording completed, CS:GO closed`);
  } finally {
    // Remove from cleanup callbacks (already handled)
    const idx = cleanupCallbacks.indexOf(cleanupTempFiles);
    if (idx !== -1) cleanupCallbacks.splice(idx, 1);
    
    // Clean up temp files
    cleanupTempFiles();
  }
  
  // Encode TGA sequence to MP4 using FFmpeg (high quality)
  console.log(`    [4/4] Encoding to MP4 (CRF ${DEFAULT_SETTINGS.crf}, ${DEFAULT_SETTINGS.preset} preset)...`);
  await encodeTgaToMp4({
    inputFolder: clipFolder,
    clipName,
    outputPath: clipOutputPath,
    framerate: DEFAULT_SETTINGS.framerate,
    crf: DEFAULT_SETTINGS.crf,
    preset: DEFAULT_SETTINGS.preset,
  });
  console.log(`    [4/4] Encoding completed: ${clipName}.mp4`);
  
  // Clean up TGA/WAV files
  cleanupTgaFiles(clipFolder);
  
  // Recording complete - post-processing is now a separate step
  return clipOutputPath;
}

/**
 * Post-process a single clip (apply slowmo, speedup, music, overlay)
 * @param {Object} options - Post-processing options
 * @returns {Promise<string>} Path to processed clip
 */
async function postprocessClip(options) {
  const {
    clipPath,
    highlight,
    speedupMultiplier,
    showOverlay,
    slowmoFactor,
  } = options;

  const speedupSegments = highlight.playback?.speedupSegments;
  const slowmotion = highlight.playback?.slowmotion;
  const hasSpeedup = speedupMultiplier && speedupSegments && speedupSegments.length > 0;
  const hasSlowmo = slowmoFactor && slowmotion;

  // Calculate total steps
  let totalSteps = 0;
  if (hasSlowmo) totalSteps++;
  if (hasSpeedup) totalSteps++;
  if (showOverlay) totalSteps++;

  if (totalSteps === 0) {
    console.log('    No post-processing needed');
    return clipPath;
  }

  let currentStep = 1;

  // IMPORTANT: Apply slowmo FIRST (before speedup changes timings)
  if (hasSlowmo) {
    console.log(`    [${currentStep}/${totalSteps}] Applying slow motion (${slowmoFactor}x at ${slowmotion.reason})...`);
    
    // Convert tick-based timing to seconds (relative to playback start)
    const tickRate = highlight.tickRate || 128;
    const playbackStartTick = highlight.playback.startTick;
    const slowmoStartTime = (slowmotion.startTick - playbackStartTick) / tickRate;
    const slowmoEndTime = (slowmotion.endTick - playbackStartTick) / tickRate;
    
    await applySlowMotionToVideo({
      inputPath: clipPath,
      startTime: slowmoStartTime,
      endTime: slowmoEndTime,
      factor: slowmoFactor,
      // Visual effects from config
      peakContrast: slowmotion.contrast || 1.2,
      peakBrightness: slowmotion.brightness || 0.05,
      peakRedBoost: slowmotion.redBoost || 0.15,
      peakSaturation: slowmotion.saturation || 1.1,
      crf: DEFAULT_SETTINGS.crf,
    });
    
    console.log(`    [${currentStep}/${totalSteps}] Slow motion applied successfully`);
    currentStep++;
  }
  
  // Apply speedup AFTER slowmo (speedup changes video duration/timings)
  if (hasSpeedup) {
    console.log(`    [${currentStep}/${totalSteps}] Applying ${speedupMultiplier}x speedup to ${speedupSegments.length} segment(s)...`);
    
    // Convert tick-based segments to time-based (relative to playback start)
    const tickRate = highlight.tickRate || 128;
    const playbackStartTick = highlight.playback.startTick;
    
    // If slowmo was applied, we need to adjust speedup timings
    // Slowmo expands the video at slowmotion.startTick
    let timeOffset = 0;
    if (hasSlowmo) {
      const slowmoOriginalDuration = (slowmotion.endTick - slowmotion.startTick) / tickRate;
      const slowmoExpandedDuration = slowmoOriginalDuration / slowmoFactor;
      timeOffset = slowmoExpandedDuration - slowmoOriginalDuration;
    }
    
    const timeSegments = speedupSegments.map(seg => {
      let startTime = (seg.startTick - playbackStartTick) / tickRate;
      let endTime = (seg.endTick - playbackStartTick) / tickRate;
      
      // Adjust timings if speedup segment is after slowmo
      if (hasSlowmo && seg.startTick > slowmotion.endTick) {
        startTime += timeOffset;
        endTime += timeOffset;
      }
      
      return {
        startTime,
        endTime,
        durationSeconds: seg.durationSeconds,
      };
    });
    
    await applySpeedupToVideo({
      inputPath: clipPath,
      segments: timeSegments,
      speedMultiplier: speedupMultiplier,
      crf: DEFAULT_SETTINGS.crf,
    });
    
    console.log(`    [${currentStep}/${totalSteps}] Speedup applied successfully`);
    currentStep++;
  }
  
  // Apply overlay LAST (after all timing changes)
  if (showOverlay) {
    console.log(`    [${currentStep}/${totalSteps}] Adding player overlay...`);
    
    await applyOverlayToVideo({
      inputPath: clipPath,
      playerName: highlight.player.name,
      highlightType: formatHighlightType(highlight),
      crf: DEFAULT_SETTINGS.crf,
    });
    
    console.log(`    [${currentStep}/${totalSteps}] Overlay applied successfully`);
  }
  
  return clipPath;
}

/**
 * Converts Steam64 ID to Steam32 (account ID) for CS:GO commands
 * Returns null if steam64 is undefined/null
 */
function steam64ToAccountId(steam64) {
  if (!steam64) {
    return null;
  }
  // Steam64 = Steam32 + 76561197960265728
  const steam64BigInt = BigInt(steam64);
  const accountId = steam64BigInt - BigInt('76561197960265728');
  return accountId.toString();
}

/**
 * Formats highlight type for display in overlay
 */
function formatHighlightType(highlight) {
  switch (highlight.type) {
    case 'clutch':
      return highlight.situation ? highlight.situation.toUpperCase() + ' CLUTCH' : 'CLUTCH';
    case 'kill-series':
      if (highlight.killCount === 5) return 'ACE';
      if (highlight.killCount === 4) return 'QUAD KILL';
      if (highlight.killCount === 3) return 'TRIPLE KILL';
      if (highlight.killCount === 2) return 'DOUBLE KILL';
      return `${highlight.killCount} KILLS`;
    case 'knife':
      return 'KNIFE KILL';
    case 'collateral':
      return 'COLLATERAL';
    default:
      return highlight.type.toUpperCase();
  }
}

/**
 * Applies player name and highlight type overlay to video
 */
async function applyOverlayToVideo(options) {
  const { inputPath, playerName, highlightType, crf } = options;
  
  // Create temp output path
  const tempOutput = inputPath.replace('.mp4', '_overlay.mp4');
  
  // Overlay settings
  const fadeDuration = 0.5; // seconds for fade in/out
  const displayDuration = 2.5; // full opacity duration
  const totalDuration = fadeDuration * 2 + displayDuration; // 3.5 seconds total
  
  // Escape special characters for FFmpeg drawtext
  const escapedName = playerName.replace(/'/g, "\\'").replace(/:/g, "\\:");
  const escapedType = highlightType.replace(/'/g, "\\'").replace(/:/g, "\\:");
  
  // Font file path - use local font in project fonts folder
  // Escape colon for FFmpeg filter syntax (C: -> C\:)
  const fontsDir = path.join(__dirname, '..', 'fonts');
  const fontFile = path.join(fontsDir, 'arial.ttf').replace(/\\/g, '/').replace(/:/g, '\\:');
  
  // Texture file path for background
  const texturesDir = path.join(__dirname, '..', 'textures');
  const texturePath = path.join(texturesDir, 'nickname-background.png').replace(/\\/g, '/').replace(/:/g, '\\:');
  
  // Alpha expression for fade in/out (commas escaped for FFmpeg filter syntax)
  // Fade in: 0-0.5s, Full: 0.5-3s, Fade out: 3-3.5s
  const fadeIn = fadeDuration;
  const fadeOutStart = fadeDuration + displayDuration;
  const alphaExpr = `if(lt(t\\,${fadeIn})\\,t/${fadeIn}\\,if(lt(t\\,${fadeOutStart})\\,1\\,(${totalDuration}-t)/${fadeDuration}))`;
  
  // Build complex filter with texture background overlay
  // Position: bottom left
  const bgX = -70; // left edge of texture from left
  const bgY = -40; // bottom edge of texture from bottom of video
  
  // Text positioning - centered inside the texture
  // Texture is 750x300, text should be inside it
  const textX = bgX + 120; // 30px padding from left edge of texture
  // Position text vertically centered in texture area
  // For 1080p: texture bottom at 1080-20=1060, top at 1060-300=760
  // Name near top of texture, type below it
  const nameY = bgY + 190; // 230px from bottom = near top of 300px texture
  const typeY = bgY + 140; // 160px from bottom = middle area of texture
  
  // Filter complex: overlay texture, then draw text
  // Loop the image and apply fade for proper duration control
  const filterComplex = [
    // Loop the image, set framerate, trim to needed duration, apply fade
    `[1:v]loop=loop=-1:size=1,setpts=N/60/TB,trim=duration=${totalDuration},format=rgba,fade=t=in:st=0:d=${fadeDuration}:alpha=1,fade=t=out:st=${fadeOutStart}:d=${fadeDuration}:alpha=1[ovr]`,
    // Overlay texture on video at bottom-left
    `[0:v][ovr]overlay=x=${bgX}:y=H-h-${bgY}:eof_action=pass,` +
    // Player name with fade (positioned at top of texture)
    `drawtext=fontfile='${fontFile}':text='${escapedName}':fontcolor=white:fontsize=48:x=${textX}:y=h-${nameY}:alpha='${alphaExpr}',` +
    // Highlight type with fade (positioned below name)
    `drawtext=fontfile='${fontFile}':text='${escapedType}':fontcolor=gold:fontsize=28:x=${textX}:y=h-${typeY}:alpha='${alphaExpr}'[vout]`,
  ].join(';');
  
  // Get actual texture path (without escaping for -i argument)
  const textureInputPath = path.join(texturesDir, 'nickname-background.png');
  
  console.log(`    Overlay: "${playerName}" - "${highlightType}"`);
  
  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-i', textureInputPath,
      '-filter_complex', filterComplex,
      '-map', '[vout]',
      '-map', '0:a',
      '-c:v', 'libx264',
      '-crf', crf.toString(),
      '-preset', 'medium',
      '-c:a', 'copy',
      '-y',
      tempOutput,
    ];
    
    const ffmpeg = spawn('ffmpeg', args, {
      stdio: 'pipe',
      windowsHide: true,
    });
    
    activeFfmpegProcess = ffmpeg;
    
    let errorOutput = '';
    ffmpeg.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    ffmpeg.on('close', (code) => {
      activeFfmpegProcess = null;
      if (code === 0) {
        // Replace original with overlay version
        try {
          fs.unlinkSync(inputPath);
          fs.renameSync(tempOutput, inputPath);
          resolve(inputPath);
        } catch (err) {
          reject(new Error(`Failed to replace video: ${err.message}`));
        }
      } else {
        // Clean up temp file on failure
        try { fs.unlinkSync(tempOutput); } catch (e) { /* ignore */ }
        reject(new Error(`FFmpeg overlay failed: ${errorOutput.slice(-500)}`));
      }
    });
    
    ffmpeg.on('error', (err) => {
      activeFfmpegProcess = null;
      reject(new Error(`Failed to run FFmpeg for overlay: ${err.message}`));
    });
  });
}

/**
 * Applies music overlay to video
 * Music is mixed with game audio at specified volumes
 * For slowmo segments: music is slowed down
 * For speedup segments: music stays at normal speed (not sped up)
 * @param {Object} options - Options for music overlay
 * @param {string} options.inputPath - Path to input video
 * @param {string} options.musicPath - Path to music file
 * @param {number} options.musicStartTime - Start time in music file
 * @param {number} options.musicEndTime - End time in music file
 * @param {number} options.musicVolume - Music volume (0-1)
 * @param {number} options.gameVolume - Game audio volume (0-1)
 * @param {Array} options.slowmoSegments - Segments where music should slow down
 * @param {Array} options.speedupSegments - Segments where video was sped up (music stays normal)
 * @param {number} options.crf - Video quality (CRF value)
 */
async function applyMusicToVideo(options) {
  const { 
    inputPath, musicPath, musicStartTime: musicStartTimeRaw, musicEndTime: musicEndTimeRaw,
    musicVolume = 0.7, gameVolume = 1.0,
    fadeDuration = 3, // Fade in/out duration in seconds
    slowmoSegments = [], speedupSegments = [],
    crf = 18
  } = options;
  
  // Parse time strings (e.g., "1:30" -> 90 seconds)
  const musicStartTime = parseTime(musicStartTimeRaw);
  const musicEndTime = parseTime(musicEndTimeRaw);
  
  // Create temp output path
  const tempOutput = inputPath.replace('.mp4', '_music_temp.mp4');
  
  // Get video duration
  const videoDuration = await getVideoDuration(inputPath);
  
  // Check if input video has audio
  const hasAudio = await checkVideoHasAudio(inputPath);
  
  // Calculate fade out start time
  const fadeOutStart = Math.max(0, videoDuration - fadeDuration);
  
  return new Promise((resolve, reject) => {
    // FFmpeg command to mix music with game audio (or just add music if no game audio)
    // Using simple afade filter (0%->100%->0% fade)
    
    let filterComplex;
    if (hasAudio) {
      // Mix game audio with music (with fade in/out on music)
      filterComplex = 
        `[0:a]volume=${gameVolume}[game];` +
        `[1:a]volume=${musicVolume},afade=t=in:st=0:d=${fadeDuration},afade=t=out:st=${fadeOutStart}:d=${fadeDuration}[music];` +
        `[game][music]amix=inputs=2:duration=first:dropout_transition=2[aout]`;
    } else {
      // No game audio - just use music with fade
      filterComplex = `[1:a]volume=${musicVolume},afade=t=in:st=0:d=${fadeDuration},afade=t=out:st=${fadeOutStart}:d=${fadeDuration}[aout]`;
    }
    
    const args = [
      '-i', inputPath,
      '-ss', String(musicStartTime),
      '-t', String(videoDuration),
      '-i', musicPath,
      '-filter_complex', filterComplex,
      '-map', '0:v',
      '-map', '[aout]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-y',
      tempOutput,
    ];
    
    const ffmpeg = spawn('ffmpeg', args);
    
    activeFfmpegProcess = ffmpeg;
    
    let errorOutput = '';
    ffmpeg.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    ffmpeg.on('close', (code) => {
      activeFfmpegProcess = null;
      if (code === 0) {
        // Replace original with music version
        try {
          fs.unlinkSync(inputPath);
          fs.renameSync(tempOutput, inputPath);
          resolve(inputPath);
        } catch (err) {
          reject(new Error(`Failed to replace video: ${err.message}`));
        }
      } else {
        // Clean up temp file on error
        try {
          if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
        } catch (e) { /* ignore */ }
        reject(new Error(`FFmpeg music mixing failed: ${errorOutput.slice(-500)}`));
      }
    });
    
    ffmpeg.on('error', (err) => {
      activeFfmpegProcess = null;
      reject(new Error(`Failed to run FFmpeg for music: ${err.message}`));
    });
  });
}

/**
 * Applies slow motion effect with cinematic impact style:
 * - Instant slowdown at kill moment + color effects (contrast, red boost, saturation)
 * - Gradual ramp-up back to normal speed + effects fade-out
 * @param {Object} options - Options for slow motion
 * @param {string} options.inputPath - Path to input video
 * @param {number} options.startTime - Start time in seconds (kill moment)
 * @param {number} options.endTime - End time in seconds
 * @param {number} options.factor - Slow motion factor at peak (e.g., 0.25 = quarter speed)
 * @param {number} options.peakContrast - Peak contrast (1.0 = normal)
 * @param {number} options.peakBrightness - Peak brightness boost (0 = none)
 * @param {number} options.peakRedBoost - Peak red/warm shift (0 = none, 0.2 = strong)
 * @param {number} options.peakSaturation - Peak color saturation (1.0 = normal)
 * @param {number} options.crf - Video quality (CRF value)
 */
async function applySlowMotionToVideo(options) {
  const { 
    inputPath, startTime, endTime, factor, 
    peakContrast = 1.2, peakBrightness = 0.05, peakRedBoost = 0.15, peakSaturation = 1.1,
    crf 
  } = options;
  
  // Create temp output path
  const tempOutput = inputPath.replace('.mp4', '_slowmo.mp4');
  
  // Impact slowmo: instant max slowdown, then gradual ramp to normal
  // Duration of slowmo effect (from kill to end)
  const slowmoDuration = endTime - startTime;
  
  // Create graduated speed segments for smooth ramp-up
  // Start at 'factor', end at 1.0 (normal speed)
  const numSegments = 12; // More segments = smoother transition
  const segmentDuration = slowmoDuration / numSegments;
  
  // Calculate speed and visual effects for each segment using sine easing
  const speeds = [];
  const effects = []; // Visual effects for "impact" look
  
  for (let i = 0; i < numSegments; i++) {
    const progress = i / (numSegments - 1); // 0 to 1
    // Sine ease-in: very smooth, stays slow longer, then accelerates
    const eased = 1 - Math.cos((progress * Math.PI) / 2);
    const speed = factor + (1.0 - factor) * eased;
    speeds.push(speed);
    
    // Effects: start at peak, fade to normal with same easing curve
    const intensity = 1 - eased; // 1 at start, 0 at end
    effects.push({
      contrast: 1 + (peakContrast - 1) * intensity,
      brightness: peakBrightness * intensity,
      redBoost: peakRedBoost * intensity,      // Warm/red shift for blood
      saturation: 1 + (peakSaturation - 1) * intensity,
    });
  }
  
  // Build filter for multi-segment slowmo with ramp
  const numParts = numSegments + 2; // before + N slowmo segments + after
  
  // Split video and audio
  const filters = [
    `[0:v]split=${numParts}[${Array.from({length: numParts}, (_, i) => `v${i}`).join('][')}]`,
    `[0:a]asplit=${numParts}[${Array.from({length: numParts}, (_, i) => `a${i}`).join('][')}]`,
  ];
  
  // Before segment (normal speed)
  filters.push(`[v0]trim=0:${startTime},setpts=PTS-STARTPTS[vbefore]`);
  filters.push(`[a0]atrim=0:${startTime},asetpts=PTS-STARTPTS[abefore]`);
  
  // Slowmo segments with graduated speeds and cinematic effects
  const slowmoOutputs = [];
  for (let i = 0; i < numSegments; i++) {
    const segStart = startTime + i * segmentDuration;
    const segEnd = startTime + (i + 1) * segmentDuration;
    const speed = speeds[i];
    const fx = effects[i];
    const setptsMultiplier = (1 / speed).toFixed(4);
    const atempoChain = buildAtempoChain(speed);
    
    // Apply slowmo + cinematic impact effect:
    // eq filter: contrast, brightness, saturation
    // colorbalance: rm (red midtones boost), bm (blue midtones reduce) for warm/blood effect
    const eqFilter = `eq=contrast=${fx.contrast.toFixed(3)}:brightness=${fx.brightness.toFixed(3)}:saturation=${fx.saturation.toFixed(3)}`;
    const colorBalance = `colorbalance=rm=${fx.redBoost.toFixed(3)}:bm=${(-fx.redBoost * 0.5).toFixed(3)}`;
    filters.push(`[v${i + 1}]trim=${segStart}:${segEnd},setpts=${setptsMultiplier}*(PTS-STARTPTS),${eqFilter},${colorBalance}[vslowmo${i}]`);
    filters.push(`[a${i + 1}]atrim=${segStart}:${segEnd},asetpts=PTS-STARTPTS,${atempoChain}[aslowmo${i}]`);
    slowmoOutputs.push(`[vslowmo${i}][aslowmo${i}]`);
  }
  
  // After segment (normal speed)
  filters.push(`[v${numSegments + 1}]trim=${endTime},setpts=PTS-STARTPTS[vafter]`);
  filters.push(`[a${numSegments + 1}]atrim=${endTime},asetpts=PTS-STARTPTS[aafter]`);
  
  // Concatenate all: before + slowmo segments + after
  const concatInputs = `[vbefore][abefore]${slowmoOutputs.join('')}[vafter][aafter]`;
  filters.push(`${concatInputs}concat=n=${numSegments + 2}:v=1:a=1[outv][outa]`);
  
  const filterComplex = filters.join(';');
  
  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-filter_complex', filterComplex,
      '-map', '[outv]',
      '-map', '[outa]',
      '-c:v', 'libx264',
      '-crf', crf.toString(),
      '-preset', 'medium',
      '-c:a', 'aac',
      '-b:a', '320k',
      '-y',
      tempOutput,
    ];
    
    const ffmpeg = spawn('ffmpeg', args, {
      stdio: 'pipe',
      windowsHide: true,
    });
    
    activeFfmpegProcess = ffmpeg;
    
    let errorOutput = '';
    ffmpeg.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    ffmpeg.on('close', (code) => {
      activeFfmpegProcess = null;
      if (code === 0) {
        // Replace original with slow motion version
        try {
          fs.unlinkSync(inputPath);
          fs.renameSync(tempOutput, inputPath);
          resolve(inputPath);
        } catch (err) {
          reject(new Error(`Failed to replace video: ${err.message}`));
        }
      } else {
        // Clean up temp file on failure
        try { fs.unlinkSync(tempOutput); } catch (e) { /* ignore */ }
        reject(new Error(`FFmpeg slow motion failed: ${errorOutput.slice(-500)}`));
      }
    });
    
    ffmpeg.on('error', (err) => {
      activeFfmpegProcess = null;
      reject(new Error(`Failed to run FFmpeg for slow motion: ${err.message}`));
    });
  });
}

/**
 * Builds atempo filter chain for audio slowdown
 * atempo only supports 0.5-2.0, so we chain multiple for extreme values
 * @param {number} factor - Speed factor (e.g., 0.25 for quarter speed)
 * @returns {string} atempo filter chain
 */
function buildAtempoChain(factor) {
  const filters = [];
  let remaining = factor;
  
  while (remaining < 0.5) {
    filters.push('atempo=0.5');
    remaining *= 2;
  }
  
  while (remaining > 2.0) {
    filters.push('atempo=2.0');
    remaining /= 2;
  }
  
  if (remaining !== 1.0) {
    filters.push(`atempo=${remaining}`);
  }
  
  return filters.length > 0 ? filters.join(',') : 'atempo=1.0';
}

/**
 * Generates VDM file content for tick-accurate demo control
 * VDM files are the Source engine's native way to control demo playback
 */
function generateVdmFile(options) {
  const { highlight, clipFolder, cfgFileName } = options;
  const { startTick, endTick } = highlight.playback;
  
  // Normalize path for CS:GO console (use forward slashes)
  const normalizedClipFolder = clipFolder.replace(/\\/g, '/');
  
  // Calculate ticks
  const preloadTick = Math.max(1, startTick - 1280); // 10 seconds before, minimum tick 1 (allows announcer sounds to finish)
  
  // Convert Steam64 to account ID for spec_player_by_accountid
  const accountId = steam64ToAccountId(highlight.player.steamId);
  
  // Build spec commands only if accountId is available
  const specCmd = accountId ? `spec_player_by_accountid ${accountId}; spec_mode 4` : '';
  const specCmdWithSemi = specCmd ? `${specCmd}; ` : '';
  
  // Build VDM actions array
  let actionIndex = 1;
  let vdmActions = '';
  
  // Action 1: Skip to preload tick
  vdmActions += `    "${actionIndex}"
    {
        factory "SkipAhead"
        name "skip_to_highlight"
        starttick "1"
        skiptotick "${preloadTick}"
    }
`;
  actionIndex++;
  
  // Action 2: Setup recording
  vdmActions += `    "${actionIndex}"
    {
        factory "PlayCommands"
        name "setup_recording"
        starttick "${preloadTick}"
        commands "exec ${cfgFileName}${specCmd ? `; ${specCmd}` : ''}"
    }
`;
  actionIndex++;
  
  // Action 3: Start recording
  vdmActions += `    "${actionIndex}"
    {
        factory "PlayCommands"
        name "start_recording"
        starttick "${startTick}"
        commands "stopsound; ${specCmdWithSemi}echo === Recording started ===; mirv_streams record start"
    }
`;
  actionIndex++;
  
  // Note: Speedup is now handled via FFmpeg post-processing, not host_timescale
  
  // Final action: Stop recording
  vdmActions += `    "${actionIndex}"
    {
        factory "PlayCommands"
        name "stop_recording"
        starttick "${endTick}"
        commands "echo === Recording ended ===; mirv_streams record end; wait 30; quit"
    }
`;
  
  const vdm = `demoactions
{
${vdmActions}}
`;

  return vdm;
}

/**
 * Generates CFG content for recording a highlight
 * These settings are applied only during recording and don't affect the user's normal config
 */
function generateRecordingCfg(options) {
  const { highlight, clipFolder, clipName, settings, voiceChat } = options;
  const { startTick, endTick } = highlight.playback;
  
  // Normalize path for CS:GO console (use forward slashes)
  const normalizedClipFolder = clipFolder.replace(/\\/g, '/');
  
  // Calculate ticks - add small buffer before recording starts
  const preloadTick = Math.max(0, startTick - 1280); // 10 seconds at 128 tick (allows announcer sounds to finish)
  
  // Convert Steam64 to account ID for spec_player_by_accountid
  const accountId = steam64ToAccountId(highlight.player.steamId);
  
  // Build camera lock commands only if accountId is available
  const cameraLockSection = accountId ? `
// === LOCK CAMERA TO PLAYER ===
// Player: ${highlight.player.name} (Steam64: ${highlight.player.steamId})
spec_player_by_accountid ${accountId}
spec_mode 4
spec_lock 1
` : `
// === CAMERA (no steamId available, camera may switch) ===
// Player: ${highlight.player.name}
spec_mode 4
`;

  const cfg = `
// ============================================
// Auto-generated HLAE recording config
// Clip: ${clipName}
// Highlight: ${highlight.type} by ${highlight.player.name}
// ============================================
// These settings are temporary and only apply during this recording session.
// Your normal CS:GO config is NOT modified.
// ============================================
${cameraLockSection}

// === VIDEO SETTINGS ===
host_framerate ${settings.framerate}
mat_setvideomode ${settings.width} ${settings.height} 1
fps_max 0
fps_max_menu 0

// === GRAPHICS QUALITY (for clean recording) ===
mat_queue_mode 2
r_dynamic 1
r_drawtracers_firstperson 1
muzzleflash_light 1
mat_postprocess_enable 1
mat_hdr_level 2

// === HUD SETTINGS (movie style - only killfeed visible) ===
cl_drawhud 1
cl_draw_only_deathnotices 1
cl_showfps 0
net_graph 0
cl_showpos 0
cl_showloadout 0

// === VIEWMODEL (show weapon) ===
r_drawviewmodel 1
cl_righthand 1

// === CROSSHAIR (classic green static) ===
// CS:GO demos don't save crosshair settings, so we set a consistent one
cl_crosshairalpha 255
cl_crosshaircolor 1
cl_crosshaircolor_r 0
cl_crosshaircolor_g 255
cl_crosshaircolor_b 0
cl_crosshairdot 0
cl_crosshairgap -1
cl_crosshairsize 2
cl_crosshairstyle 4
cl_crosshairthickness 1
cl_crosshair_drawoutline 1
cl_crosshair_outlinethickness 1
cl_crosshair_sniper_width 1
cl_crosshairusealpha 1

// === DEMO PLAYBACK SETTINGS ===
demo_debug 0
cl_showevents 0

// === SPECTATOR / X-RAY SETTINGS ===
spec_show_xray 0
cl_teamid_overhead_mode 0
cl_spec_show_player_outline 0

// === SOUND SETTINGS (for recording) ===
volume 1
snd_musicvolume 0
snd_menumusic_volume 0
snd_roundstart_volume 0
snd_roundend_volume 0
snd_mapobjective_volume 0
snd_tensecondwarning_volume 0
snd_deathcamera_volume 0
snd_mvp_volume 0

// === DISABLE ANNOUNCER AND VOICE ===
// Mute "Terrorist wins", "Counter-terrorists win", etc.
cl_autohelp 0
gameinstructor_enable 0
cl_disablefreezecam 1

// === MIRV SOUND FILTER (block round announcer) ===
// Filter out round win/lose announcements and music
mirv_snd_filter clear
${voiceChat ? '// Radio sounds enabled (--voice-chat)' : 'mirv_snd_filter add block "*radio*"'}
mirv_snd_filter add block "*terwin*"
mirv_snd_filter add block "*ctwin*"
mirv_snd_filter add block "*rounddraw*"
mirv_snd_filter add block "*wonround*"
mirv_snd_filter add block "*lostround*"
mirv_snd_filter add block "*bombpl*"
mirv_snd_filter add block "*bombdef*"
mirv_snd_filter add block "*music*"
mirv_snd_filter add block "*announcer*"
${voiceChat ? '' : `
// === DISABLE VOICE/RADIO (no voip, no radio commands) ===
voice_enable 0
snd_voipvolume 0
cl_mute_all_but_friends_and_party 1
ignorerad
voice_scale 0
`}${voiceChat ? `
// === VOICE ENABLED (both teams) ===
voice_enable 1
snd_voipvolume 1
voice_scale 1
voice_loopback 0
cl_mute_all_but_friends_and_party 0
cl_mute_enemy_team 0
voice_caster_enable 1
tv_relayvoice 1

// === SHOW CHAT (override cl_draw_only_deathnotices) ===
cl_draw_only_deathnotices 0
hud_saytext_time 12
cl_chatfilters 63
cl_showtextmsg 1

// === HIDE EVERYTHING EXCEPT KILLFEED AND CHAT ===
cl_hud_healthammo_style 0
cl_hud_background_alpha 0
cl_hud_bomb_under_radar 0
cl_hud_playercount_showcount 0
cl_hud_playercount_pos 0
cl_teamid_overhead_always 0
cl_show_team_equipment 0
cl_showloadout 0
cl_radar_always_centered 0
cl_drawhud_force_radar -1
cl_drawhud_force_weaponselection -1
cl_drawhud_force_deathnotices 1
` : ''}
// === KILLFEED SETTINGS ===
// Killfeed duration - set very high so kills stay visible for entire clip
hud_deathnotice_time 60

// === MIRV DEATH MESSAGE SETTINGS ===
// Filter to show only kills by the highlight player
// Using XUID (Steam64) with 'x' prefix as per HLAE docs
mirv_deathmsg filter clear
mirv_deathmsg lifetime 60
${highlight.player.steamId ? `mirv_deathmsg filter add block=1
mirv_deathmsg filter add attackerMatch=x${highlight.player.steamId} block=0
mirv_deathmsg localPlayer x${highlight.player.steamId}` : ''}

// === MIRV STREAMS SETUP ===
// Configure stream for high quality recording
mirv_streams add normal norm
mirv_streams edit norm record 1
mirv_streams edit norm drawHud 1
mirv_streams edit norm drawViewModel 1

// Set recording output path
mirv_streams record name "${normalizedClipFolder}"

echo "=== Recording config loaded for ${clipName} ==="
echo "=== VDM file will control playback and recording ==="
`;

  return cfg.trim();
}

/**
 * Launches HLAE with CS:GO to record the highlight
 */
function launchHlaeRecording(options) {
  const { hlaePath, csgoPath, demoPath, cfgFileName, highlight } = options;
  
  return new Promise((resolve, reject) => {
    // Build HLAE launch arguments
    // VDM file (same name as demo) will automatically load and control playback
    // VDM handles: skip to tick, exec CFG, start/stop recording
    const args = [
      '-csgoLauncher',
      '-noGui',
      '-autoStart',
      '-csgoExe', path.join(csgoPath, 'csgo.exe'),
      '-gfxEnabled', 'true',
      '-gfxWidth', String(DEFAULT_SETTINGS.width),
      '-gfxHeight', String(DEFAULT_SETTINGS.height),
      '-gfxFull', 'false',
      // Use forward slashes for CS:GO console compatibility
      '-customLaunchOptions', `-novid -console +playdemo "${demoPath.replace(/\\/g, '/')}"`,
    ];
    
    console.log(`    Waiting for CS:GO to record and quit...`);
    
    const hlaeProcess = spawn(hlaePath, args, {
      stdio: 'pipe',
      windowsHide: false,
    });
    
    // Track process for cleanup on SIGINT
    activeHlaeProcess = hlaeProcess;
    
    let output = '';
    
    hlaeProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    hlaeProcess.stderr.on('data', (data) => {
      output += data.toString();
    });
    
    hlaeProcess.on('close', (code) => {
      activeHlaeProcess = null;
      clearTimeout(timeout);
      if (code === 0 || code === null) {
        resolve();
      } else {
        reject(new Error(`HLAE exited with code ${code}: ${output}`));
      }
    });
    
    hlaeProcess.on('error', (err) => {
      activeHlaeProcess = null;
      reject(new Error(`Failed to launch HLAE: ${err.message}`));
    });
    
    // Set a timeout for recording (5 minutes max per clip)
    const timeout = setTimeout(() => {
      hlaeProcess.kill();
      reject(new Error('Recording timeout exceeded (5 minutes)'));
    }, 5 * 60 * 1000);
  });
}

/**
 * Encodes TGA image sequence to MP4 using FFmpeg
 */
function encodeTgaToMp4(options) {
  const { inputFolder, clipName, outputPath, framerate, crf, preset } = options;
  
  return new Promise((resolve, reject) => {
    // HLAE creates structure: clipFolder/take0000/norm/%05d.tga
    // Find the take folder first (take0000, take0001, etc.)
    const takeFolders = fs.readdirSync(inputFolder).filter(f => {
      const fullPath = path.join(inputFolder, f);
      return fs.statSync(fullPath).isDirectory() && f.startsWith('take');
    }).sort(); // Sort to get take0000 first
    
    if (takeFolders.length === 0) {
      reject(new Error(`No take folders found in ${inputFolder}`));
      return;
    }
    
    // Use the first take folder
    const takeFolder = path.join(inputFolder, takeFolders[0]);
    
    // Find the stream folder inside the take folder (e.g., 'norm')
    const streamFolders = fs.readdirSync(takeFolder).filter(f => {
      const fullPath = path.join(takeFolder, f);
      return fs.statSync(fullPath).isDirectory();
    });
    
    if (streamFolders.length === 0) {
      reject(new Error(`No stream folders found in ${takeFolder}`));
      return;
    }
    
    // Use the first stream folder (usually 'norm')
    const streamFolder = path.join(takeFolder, streamFolders[0]);
    
    // Detect TGA naming pattern (HLAE uses %05d.tga)
    const tgaFiles = fs.readdirSync(streamFolder).filter(f => f.endsWith('.tga')).sort();
    if (tgaFiles.length === 0) {
      reject(new Error(`No TGA files found in ${streamFolder}`));
      return;
    }
    
    // Determine pattern from first file (e.g., "00000.tga" -> "%05d.tga")
    const firstFile = tgaFiles[0];
    const numDigits = firstFile.replace('.tga', '').length;
    const tgaPattern = `%0${numDigits}d.tga`;
    
    // Build FFmpeg command with high quality settings
    const args = [
      '-framerate', String(framerate),
      '-i', path.join(streamFolder, tgaPattern),
      '-c:v', 'libx264',
      '-preset', preset,
      '-crf', String(crf),
      '-pix_fmt', 'yuv420p',
      '-y',
      outputPath,
    ];
    
    // Check for audio file in take folder (HLAE puts audio.wav there)
    const audioFile = path.join(takeFolder, 'audio.wav');
    if (fs.existsSync(audioFile)) {
      args.splice(4, 0, '-i', audioFile, '-c:a', 'aac', '-b:a', '320k');
    }
    
    console.log(`  Encoding ${clipName} to MP4...`);
    
    const ffmpeg = spawn('ffmpeg', args, {
      stdio: 'pipe',
      windowsHide: true,
    });
    
    // Track process for cleanup on SIGINT
    activeFfmpegProcess = ffmpeg;
    
    let errorOutput = '';
    
    ffmpeg.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    ffmpeg.on('close', (code) => {
      activeFfmpegProcess = null;
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`FFmpeg encoding failed: ${errorOutput}`));
      }
    });
    
    ffmpeg.on('error', (err) => {
      activeFfmpegProcess = null;
      reject(new Error(`Failed to run FFmpeg: ${err.message}. Make sure FFmpeg is installed and in PATH.`));
    });
  });
}

/**
 * Applies speedup to specific segments of a video using FFmpeg
 * @param {Object} options
 * @param {string} options.inputPath - Path to input video
 * @param {Array} options.segments - Array of {startTime, endTime} segments to speed up
 * @param {number} options.speedMultiplier - Speed multiplier (e.g., 4 for 4x)
 * @param {number} options.crf - CRF quality setting
 */
async function applySpeedupToVideo(options) {
  const { inputPath, segments, speedMultiplier, crf } = options;
  
  // Create temp output path
  const tempOutput = inputPath.replace('.mp4', '_speedup.mp4');
  
  // Get video duration using ffprobe
  const duration = await getVideoDuration(inputPath);
  
  // Build timeline of all segments (normal and speedup)
  const timeline = buildSpeedupTimeline(segments, duration);
  
  // Build FFmpeg complex filter
  const { filterComplex, outputMaps } = buildSpeedupFilter(timeline, speedMultiplier);
  
  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-filter_complex', filterComplex,
      '-map', outputMaps.video,
      '-map', outputMaps.audio,
      '-c:v', 'libx264',
      '-crf', crf.toString(),
      '-preset', 'medium',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-y',
      tempOutput,
    ];
    
    const ffmpeg = spawn('ffmpeg', args, {
      stdio: 'pipe',
      windowsHide: true,
    });
    
    activeFfmpegProcess = ffmpeg;
    
    let errorOutput = '';
    ffmpeg.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    ffmpeg.on('close', (code) => {
      activeFfmpegProcess = null;
      if (code === 0) {
        // Replace original with speedup version
        try {
          fs.unlinkSync(inputPath);
          fs.renameSync(tempOutput, inputPath);
          resolve(inputPath);
        } catch (err) {
          reject(new Error(`Failed to replace video: ${err.message}`));
        }
      } else {
        // Clean up temp file on failure
        try { fs.unlinkSync(tempOutput); } catch (e) { /* ignore */ }
        reject(new Error(`FFmpeg speedup failed: ${errorOutput.slice(-500)}`));
      }
    });
    
    ffmpeg.on('error', (err) => {
      activeFfmpegProcess = null;
      reject(new Error(`Failed to run FFmpeg for speedup: ${err.message}`));
    });
  });
}

/**
 * Gets video duration using ffprobe
 */
function getVideoDuration(videoPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoPath,
    ];
    
    const ffprobe = spawn('ffprobe', args, {
      stdio: 'pipe',
      windowsHide: true,
    });
    
    let output = '';
    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    ffprobe.on('close', (code) => {
      if (code === 0) {
        const duration = parseFloat(output.trim());
        resolve(duration);
      } else {
        reject(new Error('Failed to get video duration'));
      }
    });
    
    ffprobe.on('error', (err) => {
      reject(new Error(`Failed to run ffprobe: ${err.message}`));
    });
  });
}

/**
 * Check if video file has an audio stream
 * @param {string} videoPath - Path to video file
 * @returns {Promise<boolean>} True if video has audio
 */
function checkVideoHasAudio(videoPath) {
  return new Promise((resolve) => {
    const args = [
      '-v', 'error',
      '-select_streams', 'a',
      '-show_entries', 'stream=codec_type',
      '-of', 'csv=p=0',
      videoPath,
    ];
    
    const ffprobe = spawn('ffprobe', args, {
      stdio: 'pipe',
      windowsHide: true,
    });
    
    let output = '';
    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    ffprobe.on('close', () => {
      // If output contains 'audio', there's an audio stream
      resolve(output.trim().length > 0);
    });
    
    ffprobe.on('error', () => {
      // If ffprobe fails, assume no audio
      resolve(false);
    });
  });
}

/**
 * Builds timeline of segments with their speed settings
 */
function buildSpeedupTimeline(speedupSegments, totalDuration) {
  const timeline = [];
  let currentTime = 0;
  
  // Sort segments by start time
  const sorted = [...speedupSegments].sort((a, b) => a.startTime - b.startTime);
  
  for (const seg of sorted) {
    // Add normal segment before this speedup segment (if any gap)
    if (seg.startTime > currentTime) {
      timeline.push({
        startTime: currentTime,
        endTime: seg.startTime,
        speedup: false,
      });
    }
    
    // Add speedup segment
    timeline.push({
      startTime: seg.startTime,
      endTime: seg.endTime,
      speedup: true,
    });
    
    currentTime = seg.endTime;
  }
  
  // Add final normal segment if needed
  if (currentTime < totalDuration) {
    timeline.push({
      startTime: currentTime,
      endTime: totalDuration,
      speedup: false,
    });
  }
  
  return timeline;
}

/**
 * Builds FFmpeg complex filter for speedup
 */
function buildSpeedupFilter(timeline, speedMultiplier) {
  const videoParts = [];
  const audioParts = [];
  
  // Build atempo chain for audio (atempo only supports 0.5-2.0 range)
  const atempoFilters = buildAtempoChain(speedMultiplier);
  
  for (let i = 0; i < timeline.length; i++) {
    const seg = timeline[i];
    const trimStart = seg.startTime.toFixed(3);
    const trimEnd = seg.endTime.toFixed(3);
    
    if (seg.speedup) {
      // Video: setpts to speed up (divide PTS by multiplier)
      videoParts.push(`[0:v]trim=${trimStart}:${trimEnd},setpts=PTS/${speedMultiplier},setpts=PTS-STARTPTS[v${i}]`);
      // Audio: use atempo chain
      audioParts.push(`[0:a]atrim=${trimStart}:${trimEnd},${atempoFilters},asetpts=PTS-STARTPTS[a${i}]`);
    } else {
      // Normal speed
      videoParts.push(`[0:v]trim=${trimStart}:${trimEnd},setpts=PTS-STARTPTS[v${i}]`);
      audioParts.push(`[0:a]atrim=${trimStart}:${trimEnd},asetpts=PTS-STARTPTS[a${i}]`);
    }
  }
  
  // Build concat inputs
  const videoInputs = timeline.map((_, i) => `[v${i}]`).join('');
  const audioInputs = timeline.map((_, i) => `[a${i}]`).join('');
  
  const filterComplex = [
    ...videoParts,
    ...audioParts,
    `${videoInputs}concat=n=${timeline.length}:v=1:a=0[vout]`,
    `${audioInputs}concat=n=${timeline.length}:v=0:a=1[aout]`,
  ].join(';');
  
  return {
    filterComplex,
    outputMaps: { video: '[vout]', audio: '[aout]' },
  };
}

/**
 * Cleans up TGA/WAV files after encoding
 */
function cleanupTgaFiles(folder) {
  try {
    fs.rmSync(folder, { recursive: true, force: true });
  } catch (err) {
    console.warn(`  Warning: Could not clean up ${folder}: ${err.message}`);
  }
}

/**
 * Records all highlights from a highlights.json file (raw clips without effects)
 * @param {Object} options Recording options
 * @param {Object} options.highlightsData Parsed highlights.json data
 * @param {string} options.demosPath Path to demos folder
 * @param {string} options.hlaePath Path to HLAE executable
 * @param {string} options.csgoPath Path to CS:GO installation
 * @param {string} options.outputPath Output folder
 * @param {string} [options.playerFilter] Optional Steam ID to filter by player
 * @param {string} [options.idFilter] Optional highlight ID to record only one clip
 * @returns {Promise<string[]>} Array of recorded clip paths
 */
async function recordAllHighlights(options) {
  const { highlightsData, demosPath, hlaePath, csgoPath, outputPath, playerFilter, idFilter, voiceChat } = options;
  
  const recordedClips = [];
  const clipsFolder = path.join(outputPath, 'clips');
  
  // Scan existing clips to find already recorded highlight IDs and highest clip index
  const existingClipIds = new Set();
  let lastClipIndex = 0;
  
  if (fs.existsSync(clipsFolder)) {
    const existingFiles = fs.readdirSync(clipsFolder).filter(f => f.endsWith('.mp4'));
    for (const file of existingFiles) {
      // Parse filename format: {index}-{mapname}-{highlightId}.mp4
      const match = file.match(/^(\d+)-[^-]+-([a-f0-9]+)\.mp4$/);
      if (match) {
        const index = parseInt(match[1], 10);
        const highlightId = match[2];
        existingClipIds.add(highlightId);
        if (index > lastClipIndex) {
          lastClipIndex = index;
        }
      }
    }
  }
  
  if (existingClipIds.size > 0) {
    console.log(`\nFound ${existingClipIds.size} existing clips (last index: ${lastClipIndex})`);
  }
  
  let clipIndex = lastClipIndex;
  
  // Collect all highlights (supports both old and new formats)
  const allHighlightsRaw = getHighlights(highlightsData);
  
  // Apply filters
  const allHighlights = allHighlightsRaw.filter(highlight => {
    if (playerFilter && highlight.player?.steamId !== playerFilter) {
      return false;
    }
    if (idFilter && highlight.id !== idFilter) {
      return false;
    }
    return true;
  });
  
  // Filter out already recorded highlights
  const toRecord = allHighlights.filter(h => !existingClipIds.has(h.id));
  const skipped = allHighlights.length - toRecord.length;
  
  if (skipped > 0) {
    console.log(`Skipping ${skipped} already recorded highlights`);
  }
  
  console.log(`\nRecording ${toRecord.length} highlights...\n`);
  
  for (let i = 0; i < toRecord.length; i++) {
    const highlight = toRecord[i];
    clipIndex++;
    
    const demoPath = path.join(demosPath, highlight.demoFile);
    
    // Verify demo file exists
    if (!fs.existsSync(demoPath)) {
      console.warn(`  Warning: Demo file not found: ${highlight.demoFile}, skipping...`);
      continue;
    }
    
    // Show detailed info about current highlight
    console.log(`  [${i + 1}/${toRecord.length}] ${highlight.type} by ${highlight.player.name}`);
    console.log(`    Demo: ${highlight.demoFile}`);
    console.log(`    Duration: ${highlight.playback.durationSeconds}s (ticks ${highlight.playback.startTick}-${highlight.playback.endTick})`);
    
    try {
      const clipPath = await recordHighlight({
        hlaePath,
        csgoPath,
        demoPath,
        highlight,
        outputPath,
        clipIndex,
        voiceChat,
      });
      
      recordedClips.push(clipPath);
      console.log(`    SUCCESS: ${path.basename(clipPath)}\n`);
    } catch (err) {
      console.error(`    FAILED: ${err.message}\n`);
      throw err; // Stop on first error
    }
  }
  
  return recordedClips;
}

export {
  recordHighlight,
  recordAllHighlights,
  postprocessClip,
  applyMusicToVideo,
  formatHighlightType,
  DEFAULT_SETTINGS,
};
