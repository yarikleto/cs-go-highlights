const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Supported audio formats
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac'];

/**
 * Get audio duration using ffprobe
 * @param {string} filePath - Path to audio file
 * @returns {Promise<number>} Duration in seconds
 */
async function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      filePath,
    ]);

    let output = '';
    let errorOutput = '';

    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobe.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed: ${errorOutput}`));
        return;
      }
      const duration = parseFloat(output.trim());
      if (isNaN(duration)) {
        reject(new Error(`Could not parse duration from: ${output}`));
        return;
      }
      resolve(duration);
    });
  });
}


/**
 * Scan music folder and analyze all tracks
 * @param {string} folderPath - Path to music folder
 * @returns {Promise<Array>} Array of track info objects
 */
async function analyzeMusicFolder(folderPath) {
  if (!fs.existsSync(folderPath)) {
    throw new Error(`Music folder not found: ${folderPath}`);
  }

  const files = fs.readdirSync(folderPath);
  const audioFiles = files.filter(f => 
    AUDIO_EXTENSIONS.includes(path.extname(f).toLowerCase())
  );

  if (audioFiles.length === 0) {
    throw new Error(`No audio files found in ${folderPath}`);
  }

  console.log(`  Found ${audioFiles.length} audio file(s) in music folder`);

  const tracks = [];
  
  for (const file of audioFiles.sort()) {
    const filePath = path.join(folderPath, file);
    console.log(`    Analyzing: ${file}`);
    
    try {
      const duration = await getAudioDuration(filePath);
      
      tracks.push({
        path: filePath,
        filename: file,
        duration,
      });
      
      console.log(`      Duration: ${formatTime(duration)}`);
    } catch (error) {
      console.error(`      Error analyzing ${file}: ${error.message}`);
    }
  }

  if (tracks.length === 0) {
    throw new Error('No valid audio tracks found');
  }

  return tracks;
}

/**
 * Format seconds as M:SS (e.g., 90 -> "1:30", 90.5 -> "1:30.5")
 * @param {number} seconds 
 * @returns {string}
 */
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const secsInt = Math.floor(secs);
  const secsDecimal = secs - secsInt;
  
  if (secsDecimal > 0.001) {
    // Include decimal part (1 decimal place)
    return `${mins}:${secsInt.toString().padStart(2, '0')}.${Math.round(secsDecimal * 10)}`;
  }
  return `${mins}:${secsInt.toString().padStart(2, '0')}`;
}

/**
 * Parse time string (M:SS or M:SS.s) to seconds
 * Also accepts raw numbers (seconds) and negative values
 * @param {string|number} timeStr - Time in "M:SS" or "M:SS.s" format, or seconds as number
 * @returns {number} Seconds
 */
function parseTime(timeStr) {
  // If already a number, return it
  if (typeof timeStr === 'number') {
    return timeStr;
  }
  
  // Check for negative sign
  const isNegative = timeStr.startsWith('-');
  const absTimeStr = isNegative ? timeStr.slice(1) : timeStr;
  
  // Parse string format "M:SS" or "M:SS.s"
  const match = absTimeStr.match(/^(\d+):(\d{2})(?:\.(\d+))?$/);
  if (!match) {
    // Try parsing as plain number
    const num = parseFloat(timeStr);
    if (!isNaN(num)) {
      return num;
    }
    throw new Error(`Invalid time format: "${timeStr}". Expected "M:SS" or "M:SS.s"`);
  }
  
  const mins = parseInt(match[1], 10);
  const secs = parseInt(match[2], 10);
  const decimal = match[3] ? parseInt(match[3], 10) / Math.pow(10, match[3].length) : 0;
  
  const result = mins * 60 + secs + decimal;
  return isNegative ? -result : result;
}

/**
 * MusicPlaylist class - manages music track progression across clips
 */
class MusicPlaylist {
  constructor(musicFolder) {
    this.musicFolder = musicFolder;
    this.tracks = [];
    this.currentTrackIndex = 0;
    this.currentPosition = 0;
  }

  /**
   * Analyze all tracks in the music folder
   */
  async analyze() {
    this.tracks = await analyzeMusicFolder(this.musicFolder);
    return this.tracks;
  }

  /**
   * Get total available music duration
   */
  getTotalDuration() {
    return this.tracks.reduce((sum, t) => sum + t.duration, 0);
  }

  /**
   * Generate music mapping for all highlights
   * Music plays sequentially - each clip gets the next segment of music
   * @param {Array} highlights - Array of highlight objects with playback info
   * @param {number} tickRate - Demo tick rate
   * @returns {Object} Music mapping object
   */
  generateMapping(highlights, tickRate) {
    const mapping = {
      tracks: this.tracks.map(t => ({
        path: t.path,
        filename: t.filename,
        duration: t.duration,
      })),
      clips: {},
    };

    let currentTrackIndex = 0;
    let currentPosition = 0;

    for (const highlight of highlights) {
      const clipDuration = (highlight.playback.endTick - highlight.playback.startTick) / tickRate;

      // Check if we have enough music in current track
      let remainingInTrack = this.tracks[currentTrackIndex].duration - currentPosition;
      
      // If not enough in current track, try next track
      while (remainingInTrack < clipDuration && currentTrackIndex < this.tracks.length - 1) {
        currentTrackIndex++;
        currentPosition = 0;
        remainingInTrack = this.tracks[currentTrackIndex].duration;
      }

      // Check if we have enough music at all
      if (remainingInTrack < clipDuration) {
        throw new Error(
          `Not enough music for all clips!\n` +
          `  Clip "${highlight.id}" needs ${formatTime(clipDuration)} but only ${formatTime(remainingInTrack)} remaining.\n` +
          `  Add more tracks to the music folder.`
        );
      }

      const track = this.tracks[currentTrackIndex];
      const startTime = currentPosition;
      const endTime = startTime + clipDuration;

      mapping.clips[highlight.id] = {
        track: track.path,
        trackFilename: track.filename,
        startTime: formatTime(startTime),    // e.g., "1:30" instead of 90
        endTime: formatTime(endTime),        // e.g., "2:15.5" instead of 135.5
        duration: formatTime(clipDuration),  // e.g., "0:45" instead of 45
        offset: "0:00", // User can edit this manually (e.g., "1:30" to skip 90 seconds)
      };

      // Advance position for next clip
      currentPosition = endTime;
    }

    return mapping;
  }
}

/**
 * Resync music mapping - recalculates startTime/endTime based on offsets
 * Offsets accumulate: if clip 1 has offset +10, clip 2's startTime will also shift by 10
 * @param {Object} mapping - The music mapping object
 * @returns {Object} Updated music mapping object
 */
function resyncMusicMapping(mapping) {
  const clipIds = Object.keys(mapping.clips);
  
  if (clipIds.length === 0) {
    return mapping;
  }

  // Sort clips by their original startTime to maintain order
  const sortedClips = clipIds
    .map(id => ({ id, ...mapping.clips[id] }))
    .sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));

  // Find the track list
  const tracks = mapping.tracks;
  if (!tracks || tracks.length === 0) {
    throw new Error('No tracks found in mapping');
  }

  // Recalculate positions with offsets
  let currentTrackIndex = 0;
  let currentPosition = 0;
  let accumulatedOffset = 0;

  for (const clip of sortedClips) {
    // Parse offset (can be "1:30" or 0 or "0:00")
    const clipOffset = parseTime(clip.offset || 0);
    const clipDuration = parseTime(clip.duration);
    accumulatedOffset += clipOffset;
    
    // Apply accumulated offset to current position
    let targetPosition = currentPosition + accumulatedOffset;
    
    // Handle negative position (can't go before track start)
    if (targetPosition < 0) {
      console.warn(`  Warning: Clip "${clip.id}" offset would go before track start, clamping to 0`);
      targetPosition = 0;
    }

    // Find the right track for this position
    let trackOffset = 0;
    for (let i = 0; i < currentTrackIndex; i++) {
      trackOffset += tracks[i].duration;
    }
    
    // Adjust if we need to move to a different track due to offset
    let absolutePosition = trackOffset + targetPosition;
    let newTrackIndex = 0;
    let posInTrack = absolutePosition;
    
    for (let i = 0; i < tracks.length; i++) {
      if (posInTrack < tracks[i].duration) {
        newTrackIndex = i;
        break;
      }
      posInTrack -= tracks[i].duration;
      newTrackIndex = i + 1;
    }

    if (newTrackIndex >= tracks.length) {
      throw new Error(`Not enough music after applying offsets! Ran out at clip "${clip.id}"`);
    }

    const track = tracks[newTrackIndex];
    const startTime = posInTrack;
    const endTime = startTime + clipDuration;

    // Check if clip fits in current track
    if (endTime > track.duration) {
      // Move to next track
      if (newTrackIndex + 1 >= tracks.length) {
        throw new Error(`Not enough music! Clip "${clip.id}" doesn't fit in remaining tracks.`);
      }
      newTrackIndex++;
      posInTrack = 0;
    }

    // Update the clip in mapping (using formatted times)
    mapping.clips[clip.id] = {
      ...mapping.clips[clip.id],
      track: tracks[newTrackIndex].path,
      trackFilename: tracks[newTrackIndex].filename,
      startTime: formatTime(posInTrack),
      endTime: formatTime(posInTrack + clipDuration),
    };

    // Update position for next clip (without offset, offset is applied separately)
    currentPosition += clipDuration;
    currentTrackIndex = newTrackIndex;
  }

  return mapping;
}

/**
 * Load music mapping from file
 * @param {string} filePath - Path to music-mapping.json
 * @returns {Object|null} Mapping object or null if not found
 */
function loadMusicMapping(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error loading music mapping: ${error.message}`);
    return null;
  }
}

/**
 * Save music mapping to file
 * @param {string} filePath - Path to save music-mapping.json
 * @param {Object} mapping - Mapping object
 */
function saveMusicMapping(filePath, mapping) {
  fs.writeFileSync(filePath, JSON.stringify(mapping, null, 2));
}

module.exports = {
  MusicPlaylist,
  analyzeMusicFolder,
  getAudioDuration,
  loadMusicMapping,
  saveMusicMapping,
  resyncMusicMapping,
  formatTime,
  parseTime,
  AUDIO_EXTENSIONS,
};
