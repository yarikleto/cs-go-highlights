const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Merges multiple video clips into a single video using FFmpeg
 * @param {Object} options Merge options
 * @param {string[]} options.clipPaths Array of paths to video clips
 * @param {string} options.outputPath Path for the final merged video
 * @param {boolean} [options.cleanupClips=false] Whether to delete clips after merging
 * @param {number} [options.transitionDuration=null] Duration of fade in/out transitions in seconds
 * @returns {Promise<string>} Path to the merged video
 */
async function mergeClips(options) {
  const { clipPaths, outputPath, cleanupClips = false, transitionDuration = null } = options;
  
  if (clipPaths.length === 0) {
    throw new Error('No clips to merge');
  }
  
  if (clipPaths.length === 1) {
    // Only one clip - apply transitions if requested, otherwise just copy
    if (transitionDuration) {
      console.log(`\nApplying fade transitions to single clip...`);
      await applyFadeToSingleClip(clipPaths[0], outputPath, transitionDuration);
    } else {
      fs.copyFileSync(clipPaths[0], outputPath);
    }
    if (cleanupClips) {
      fs.unlinkSync(clipPaths[0]);
    }
    return outputPath;
  }
  
  console.log(`\nMerging ${clipPaths.length} clips into final video...`);
  
  try {
    if (transitionDuration) {
      // Use complex filter for fade transitions (requires re-encoding)
      console.log(`Applying ${transitionDuration}s fade transitions (this may take longer)...`);
      await runFfmpegMergeWithTransitions(clipPaths, outputPath, transitionDuration);
    } else {
      // Simple concat without re-encoding
      const concatListPath = path.join(path.dirname(outputPath), 'concat_list.txt');
      const concatContent = clipPaths
        .map(clipPath => `file '${clipPath.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
        .join('\n');
      
      fs.writeFileSync(concatListPath, concatContent);
      await runFfmpegConcat(concatListPath, outputPath);
      fs.unlinkSync(concatListPath);
    }
    
    if (cleanupClips) {
      for (const clipPath of clipPaths) {
        try {
          fs.unlinkSync(clipPath);
        } catch (err) {
          console.warn(`Warning: Could not delete clip ${clipPath}: ${err.message}`);
        }
      }
    }
    
    return outputPath;
  } catch (err) {
    // Cleanup concat list on error
    const concatListPath = path.join(path.dirname(outputPath), 'concat_list.txt');
    if (fs.existsSync(concatListPath)) {
      fs.unlinkSync(concatListPath);
    }
    throw err;
  }
}

/**
 * Applies fade in/out to a single clip
 */
async function applyFadeToSingleClip(inputPath, outputPath, fadeDuration) {
  const duration = await getVideoDuration(inputPath);
  const fadeOutStart = Math.max(0, duration - fadeDuration);
  
  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-vf', `fade=t=in:st=0:d=${fadeDuration},fade=t=out:st=${fadeOutStart}:d=${fadeDuration}`,
      '-af', `afade=t=in:st=0:d=${fadeDuration},afade=t=out:st=${fadeOutStart}:d=${fadeDuration}`,
      '-c:v', 'libx264',
      '-crf', '18',
      '-preset', 'medium',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-y',
      outputPath,
    ];
    
    const ffmpeg = spawn('ffmpeg', args, {
      stdio: 'pipe',
      windowsHide: true,
    });
    
    let errorOutput = '';
    ffmpeg.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        console.log(`Merged video saved to: ${outputPath}`);
        resolve(outputPath);
      } else {
        reject(new Error(`FFmpeg fade failed: ${errorOutput.slice(-500)}`));
      }
    });
    
    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to run FFmpeg: ${err.message}`));
    });
  });
}

/**
 * Merges clips with fade in/out transitions using FFmpeg complex filter
 */
async function runFfmpegMergeWithTransitions(clipPaths, outputPath, fadeDuration) {
  // Get durations of all clips
  const durations = await Promise.all(clipPaths.map(clip => getVideoDuration(clip)));
  
  // Build input arguments
  const inputArgs = clipPaths.flatMap(clip => ['-i', clip]);
  
  // Build complex filter for fades
  const videoFilters = [];
  const audioFilters = [];
  const videoOutputs = [];
  const audioOutputs = [];
  
  for (let i = 0; i < clipPaths.length; i++) {
    const duration = durations[i];
    const fadeOutStart = Math.max(0, duration - fadeDuration);
    
    // First clip: only fade out at end
    // Middle clips: fade in at start, fade out at end
    // Last clip: only fade in at start
    let vFilter = '';
    let aFilter = '';
    
    if (i === 0) {
      // First clip: fade out only
      vFilter = `[${i}:v]fade=t=out:st=${fadeOutStart}:d=${fadeDuration}[v${i}]`;
      aFilter = `[${i}:a]afade=t=out:st=${fadeOutStart}:d=${fadeDuration}[a${i}]`;
    } else if (i === clipPaths.length - 1) {
      // Last clip: fade in only
      vFilter = `[${i}:v]fade=t=in:st=0:d=${fadeDuration}[v${i}]`;
      aFilter = `[${i}:a]afade=t=in:st=0:d=${fadeDuration}[a${i}]`;
    } else {
      // Middle clips: both fade in and fade out
      vFilter = `[${i}:v]fade=t=in:st=0:d=${fadeDuration},fade=t=out:st=${fadeOutStart}:d=${fadeDuration}[v${i}]`;
      aFilter = `[${i}:a]afade=t=in:st=0:d=${fadeDuration},afade=t=out:st=${fadeOutStart}:d=${fadeDuration}[a${i}]`;
    }
    
    videoFilters.push(vFilter);
    audioFilters.push(aFilter);
    videoOutputs.push(`[v${i}]`);
    audioOutputs.push(`[a${i}]`);
  }
  
  // Concat all streams
  const concatVideo = `${videoOutputs.join('')}concat=n=${clipPaths.length}:v=1:a=0[vout]`;
  const concatAudio = `${audioOutputs.join('')}concat=n=${clipPaths.length}:v=0:a=1[aout]`;
  
  const filterComplex = [...videoFilters, ...audioFilters, concatVideo, concatAudio].join(';');
  
  return new Promise((resolve, reject) => {
    const args = [
      ...inputArgs,
      '-filter_complex', filterComplex,
      '-map', '[vout]',
      '-map', '[aout]',
      '-c:v', 'libx264',
      '-crf', '18',
      '-preset', 'medium',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-y',
      outputPath,
    ];
    
    const ffmpeg = spawn('ffmpeg', args, {
      stdio: 'pipe',
      windowsHide: true,
    });
    
    let errorOutput = '';
    ffmpeg.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        console.log(`Merged video saved to: ${outputPath}`);
        resolve(outputPath);
      } else {
        reject(new Error(`FFmpeg merge with transitions failed: ${errorOutput.slice(-500)}`));
      }
    });
    
    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to run FFmpeg: ${err.message}`));
    });
  });
}

/**
 * Runs FFmpeg concat demuxer to merge videos
 */
function runFfmpegConcat(concatListPath, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-c', 'copy',
      '-y',
      outputPath,
    ];
    
    const ffmpeg = spawn('ffmpeg', args, {
      stdio: 'pipe',
      windowsHide: true,
    });
    
    let errorOutput = '';
    
    ffmpeg.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        console.log(`Merged video saved to: ${outputPath}`);
        resolve(outputPath);
      } else {
        reject(new Error(`FFmpeg merge failed: ${errorOutput}`));
      }
    });
    
    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to run FFmpeg: ${err.message}. Make sure FFmpeg is installed and in PATH.`));
    });
  });
}

/**
 * Cleans up temporary files and folders from recording
 * @param {string} outputPath Output folder path
 */
function cleanupTempFiles(outputPath) {
  const tempFolder = path.join(outputPath, 'temp');
  const clipsFolder = path.join(outputPath, 'clips');
  
  try {
    if (fs.existsSync(tempFolder)) {
      fs.rmSync(tempFolder, { recursive: true, force: true });
      console.log('Cleaned up temporary files');
    }
  } catch (err) {
    console.warn(`Warning: Could not clean up temp folder: ${err.message}`);
  }
  
  // Optionally clean up clips folder if empty
  try {
    if (fs.existsSync(clipsFolder)) {
      const remaining = fs.readdirSync(clipsFolder);
      if (remaining.length === 0) {
        fs.rmdirSync(clipsFolder);
      }
    }
  } catch (err) {
    // Ignore errors when cleaning up clips folder
  }
}

/**
 * Gets video duration using FFprobe
 * @param {string} videoPath Path to video file
 * @returns {Promise<number>} Duration in seconds
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
        resolve(isNaN(duration) ? 0 : duration);
      } else {
        resolve(0); // Return 0 if ffprobe fails
      }
    });
    
    ffprobe.on('error', () => {
      resolve(0); // Return 0 if ffprobe not available
    });
  });
}

/**
 * Generates a summary of the merged video
 * @param {string} videoPath Path to the merged video
 * @param {number} clipCount Number of clips merged
 * @returns {Promise<Object>} Summary object
 */
async function generateSummary(videoPath, clipCount) {
  const duration = await getVideoDuration(videoPath);
  const stats = fs.statSync(videoPath);
  
  return {
    outputFile: videoPath,
    clipCount,
    durationSeconds: Math.round(duration * 100) / 100,
    durationFormatted: formatDuration(duration),
    fileSizeMB: Math.round(stats.size / (1024 * 1024) * 100) / 100,
  };
}

/**
 * Formats duration in seconds to MM:SS or HH:MM:SS
 */
function formatDuration(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

module.exports = {
  mergeClips,
  cleanupTempFiles,
  getVideoDuration,
  generateSummary,
};
