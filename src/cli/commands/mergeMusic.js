/**
 * @fileoverview Merge music command - combine audio files
 * 
 * Concatenates multiple audio files into a single track.
 * Useful for creating continuous background music from shorter tracks.
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { validateDirExists } = require('../validators');
const { getMediaDuration } = require('../utils/ffmpeg');
const { formatTime } = require('../utils/time');

// Supported audio formats
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'];

/**
 * Main merge-music command handler
 * 
 * @param {Object} options - Command options
 */
async function mergeMusicCommand(options) {
  const musicFolder = validateDirExists(options.music, 'Music folder');
  
  // Find audio files
  const audioFiles = findAudioFiles(musicFolder);
  
  if (audioFiles.length === 0) {
    console.error('Error: No audio files found in music folder');
    process.exit(1);
  }
  
  if (audioFiles.length === 1) {
    console.log('Only one audio file found, nothing to merge.');
    process.exit(0);
  }
  
  // Determine output path
  const outputPath = options.output 
    ? path.resolve(options.output)
    : generateOutputPath(musicFolder, audioFiles[0]);
  
  // Print summary
  printMergeSummary(musicFolder, audioFiles, outputPath);
  
  // Show durations
  const totalExpected = printFileDurations(musicFolder, audioFiles);
  
  // Merge files
  await mergeAudioFiles(musicFolder, audioFiles, outputPath);
  
  // Verify and print results
  printMergeResults(outputPath, totalExpected);
}

/**
 * Find all audio files in folder
 * 
 * @param {string} folder - Folder path
 * @returns {string[]} Sorted audio filenames
 */
function findAudioFiles(folder) {
  return fs.readdirSync(folder)
    .filter(f => AUDIO_EXTENSIONS.includes(path.extname(f).toLowerCase()))
    .sort();
}

/**
 * Generate output path based on first song name
 * 
 * @param {string} folder - Music folder
 * @param {string} firstFile - First audio filename
 * @returns {string} Output path
 */
function generateOutputPath(folder, firstFile) {
  const firstSongName = path.parse(firstFile).name;
  return path.join(folder, `${firstSongName}_merged.mp3`);
}

/**
 * Print merge summary
 */
function printMergeSummary(folder, files, outputPath) {
  console.log('CS:GO Highlights Music Merger');
  console.log('=============================');
  console.log(`Music folder: ${folder}`);
  console.log(`Files to merge: ${files.length}`);
  files.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  console.log(`Output: ${outputPath}`);
  console.log('');
}

/**
 * Print duration of each file and return total
 * 
 * @param {string} folder - Music folder
 * @param {string[]} files - Audio filenames
 * @returns {number} Total expected duration in seconds
 */
function printFileDurations(folder, files) {
  console.log('File durations:');
  let totalExpected = 0;
  
  files.forEach((f, i) => {
    const filePath = path.join(folder, f);
    const duration = getMediaDuration(filePath);
    
    if (duration > 0) {
      totalExpected += duration;
      console.log(`  ${i + 1}. ${f}: ${formatTime(duration)}`);
    } else {
      console.log(`  ${i + 1}. ${f}: (could not read duration)`);
    }
  });
  
  console.log(`  Expected total: ${formatTime(totalExpected)}`);
  return totalExpected;
}

/**
 * Merge audio files using FFmpeg
 * 
 * @param {string} folder - Music folder
 * @param {string[]} files - Audio filenames
 * @param {string} outputPath - Output file path
 */
async function mergeAudioFiles(folder, files, outputPath) {
  // Create temp file list for FFmpeg concat
  const listPath = path.join(folder, '_merge_list.txt');
  const listContent = files
    .map(f => {
      const fullPath = path.join(folder, f).replace(/\\/g, '/');
      return `file '${fullPath.replace(/'/g, "'\\''")}'`;
    })
    .join('\n');
  fs.writeFileSync(listPath, listContent);
  
  try {
    console.log('\nMerging audio files...');
    
    // Use FFmpeg concat
    execSync(
      `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c:a libmp3lame -q:a 2 "${outputPath}"`,
      { stdio: 'pipe' }
    );
    
    // Clean up temp file
    fs.unlinkSync(listPath);
  } catch (err) {
    // Clean up on error
    if (fs.existsSync(listPath)) {
      fs.unlinkSync(listPath);
    }
    console.error(`Error merging audio: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Print merge results and verify duration
 * 
 * @param {string} outputPath - Output file path
 * @param {number} totalExpected - Expected duration in seconds
 */
function printMergeResults(outputPath, totalExpected) {
  const mergedDuration = getMediaDuration(outputPath);
  
  console.log('\n=============================');
  console.log('Merge Complete!');
  console.log('=============================');
  console.log(`Output: ${outputPath}`);
  console.log(`Merged duration: ${formatTime(mergedDuration)}`);
  
  // Warn if duration mismatch
  if (Math.abs(mergedDuration - totalExpected) > 1) {
    console.log(`WARNING: Duration mismatch! Expected ${formatTime(totalExpected)}`);
  }
}

module.exports = { mergeMusicCommand };
