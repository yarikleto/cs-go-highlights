/**
 * @fileoverview FFmpeg wrapper utilities
 * 
 * Provides Promise-based wrappers for FFmpeg operations.
 * These utilities handle progress reporting and error handling.
 */

const { spawn, execSync } = require('child_process');

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
      '-preset', 'medium',  // Balance between speed and compression
      '-c:a', 'aac',
      '-b:a', '128k',
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
 * Map compression power level (1-10) to CRF value (18-36)
 * 
 * @param {number} power - Compression power (1 = light, 10 = maximum)
 * @returns {number} CRF value for FFmpeg
 */
function powerToCrf(power) {
  // Power 1 = CRF 18 (minimal compression, high quality)
  // Power 10 = CRF 36 (maximum compression, lower quality)
  return 18 + Math.round((power - 1) * (36 - 18) / 9);
}

module.exports = {
  runFfmpegCompress,
  getMediaDuration,
  powerToCrf,
};
