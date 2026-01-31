import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

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
 * Merges clips with crossfade transitions using FFmpeg xfade filter
 * Clips blend into each other without black screen
 */
async function runFfmpegMergeWithTransitions(clipPaths, outputPath, fadeDuration) {
  // Get durations of all clips
  const durations = await Promise.all(clipPaths.map(clip => getVideoDuration(clip)));
  
  // Build input arguments
  const inputArgs = clipPaths.flatMap(clip => ['-i', clip]);
  
  // Build xfade filter chain for smooth crossfades between clips
  // xfade blends two videos together during transition (no black screen)
  const filters = [];
  
  // First clip: fade in from black at start
  filters.push(`[0:v]fade=t=in:st=0:d=${fadeDuration}[v0]`);
  filters.push(`[0:a]afade=t=in:st=0:d=${fadeDuration}[a0]`);
  
  // Calculate xfade offsets (when each transition starts)
  // Each xfade reduces total duration by fadeDuration
  let videoChain = '[v0]';
  let audioChain = '[a0]';
  let cumulativeOffset = durations[0] - fadeDuration;
  
  for (let i = 1; i < clipPaths.length; i++) {
    const isLast = i === clipPaths.length - 1;
    const lastFadeOut = isLast ? `,fade=t=out:st=${durations[i] - fadeDuration}:d=${fadeDuration}` : '';
    const lastAudioFadeOut = isLast ? `,afade=t=out:st=${durations[i] - fadeDuration}:d=${fadeDuration}` : '';
    
    // Prepare current clip (add fade out if last)
    filters.push(`[${i}:v]null${lastFadeOut}[vin${i}]`);
    filters.push(`[${i}:a]anull${lastAudioFadeOut}[ain${i}]`);
    
    // xfade with previous result
    const xfadeOffset = Math.max(0, cumulativeOffset);
    filters.push(`${videoChain}[vin${i}]xfade=transition=fade:duration=${fadeDuration}:offset=${xfadeOffset}[vx${i}]`);
    filters.push(`${audioChain}[ain${i}]acrossfade=d=${fadeDuration}[ax${i}]`);
    
    videoChain = `[vx${i}]`;
    audioChain = `[ax${i}]`;
    
    // Update cumulative offset for next transition
    cumulativeOffset += durations[i] - fadeDuration;
  }
  
  // Final output labels
  const finalVideoLabel = clipPaths.length > 1 ? `[vx${clipPaths.length - 1}]` : '[v0]';
  const finalAudioLabel = clipPaths.length > 1 ? `[ax${clipPaths.length - 1}]` : '[a0]';
  
  // Rename final outputs to [vout] and [aout]
  filters.push(`${finalVideoLabel}null[vout]`);
  filters.push(`${finalAudioLabel}anull[aout]`);
  
  const filterComplex = filters.join(';');
  
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

export {
  mergeClips,
  cleanupTempFiles,
  getVideoDuration,
  generateSummary,
};
