/**
 * @fileoverview FFmpeg wrapper utilities
 * 
 * Provides Promise-based wrappers for FFmpeg operations.
 * These utilities handle progress reporting and error handling.
 */

import { spawn, execSync } from 'child_process';
import { ENCODING } from '../../config.js';

/**
 * Run FFmpeg compression with CRF (Constant Rate Factor)
 * 
 * CRF values:
 * - 0 = lossless (huge files)
 * - 18 = visually lossless (recommended minimum)
 * - 23 = default
 * - 28 = acceptable quality
 * - 51 = worst quality (smallest files)
 * 
 * @param {string} inputPath - Path to input video file
 * @param {string} outputPath - Path for output video file
 * @param {number} crf - CRF value (18-51)
 * @returns {Promise<void>} Resolves when compression completes
 */
function runFfmpegCompress(inputPath, outputPath, crf) {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-c:v', 'libx264',
      '-crf', crf.toString(),
      '-preset', ENCODING.preset.postprocess,
      '-c:a', 'aac',
      '-b:a', ENCODING.audioBitrate.low,
      '-y',  // Overwrite output file
      outputPath,
    ];
    
    const ffmpeg = spawn('ffmpeg', args, {
      stdio: 'pipe',
      windowsHide: true,
    });
    
    let lastProgress = '';
    
    // FFmpeg outputs progress to stderr
    ffmpeg.stderr.on('data', (data) => {
      const output = data.toString();
      
      // Extract and display progress timestamp
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
      reject(new Error(
        `Failed to run FFmpeg: ${err.message}. Make sure FFmpeg is installed and in PATH.`
      ));
    });
  });
}

/**
 * Get duration of a media file using FFprobe
 * 
 * @param {string} filePath - Path to media file
 * @returns {number} Duration in seconds (0 if error)
 */
function getMediaDuration(filePath) {
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: 'utf-8' }
    );
    return parseFloat(result.trim()) || 0;
  } catch (e) {
    return 0;
  }
}

/**
 * Map compression power level (1-10) to CRF value
 * 
 * @param {number} power - Compression power (1 = light, 10 = maximum)
 * @returns {number} CRF value for FFmpeg
 */
function powerToCrf(power) {
  // Power 1 = CRF min (minimal compression, high quality)
  // Power 10 = CRF max (maximum compression, lower quality)
  const { min, max } = ENCODING.crf;
  return min + Math.round((power - 1) * (max - min) / 9);
}

export {
  runFfmpegCompress,
  getMediaDuration,
  powerToCrf,
};
