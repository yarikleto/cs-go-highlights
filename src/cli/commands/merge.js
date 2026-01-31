/**
 * @fileoverview Merge command - combine clips into final video
 * 
 * Concatenates processed clips into a single highlight video.
 * Optionally adds fade transitions between clips.
 */

const path = require('path');
const fs = require('fs');
const { mergeClips, generateSummary } = require('../../merger');
const { validateDirExists, ensureDir, sortClipFiles } = require('../validators');

/**
 * Main merge command handler
 * 
 * @param {Object} options - Command options
 */
async function mergeCommand(options) {
  const clipsPath = validateClipsFolderOrSuggest(options.clips);
  const outputPath = path.resolve(options.output);
  const shouldCleanup = options.cleanup || false;
  const transitionDuration = options.transition || null;

  // Find clip files
  const clipFiles = findClipFiles(clipsPath);

  // Print summary
  printMergeSummary({
    clipsPath,
    outputPath,
    clipCount: clipFiles.length,
    transitionDuration,
    shouldCleanup,
  });

  // Ensure output directory
  ensureDir(path.dirname(outputPath));

  try {
    await mergeClips({
      clipPaths: clipFiles,
      outputPath,
      cleanupClips: shouldCleanup,
      transitionDuration,
    });

    // Generate and display summary
    const summary = await generateSummary(outputPath, clipFiles.length);
    printMergeCompletion(summary);
  } catch (err) {
    console.error(`\nError during merging: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Validate clips folder exists, suggest alternatives if not
 * 
 * @param {string} clipsOption - Clips path from options
 * @returns {string} Resolved clips path
 */
function validateClipsFolderOrSuggest(clipsOption) {
  const clipsPath = path.resolve(clipsOption);
  
  if (fs.existsSync(clipsPath)) {
    return clipsPath;
  }
  
  console.error(`Error: Clips folder not found: ${clipsPath}`);
  
  // Suggest available folders
  const outputDir = path.dirname(clipsPath);
  if (fs.existsSync(outputDir)) {
    const folders = fs.readdirSync(outputDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name.startsWith('clips'))
      .map(d => d.name);
      
    if (folders.length > 0) {
      console.error(`\nAvailable clip folders in ${outputDir}:`);
      folders.forEach(f => console.error(`  - ${f}`));
      console.error(`\nTry: node src/index.js merge --clips ${path.join(outputDir, folders[0])}`);
    }
  }
  
  process.exit(1);
}

/**
 * Find and sort clip files
 * 
 * @param {string} clipsPath - Path to clips folder
 * @returns {string[]} Full paths to clip files
 */
function findClipFiles(clipsPath) {
  const files = fs.readdirSync(clipsPath)
    .filter(file => file.endsWith('.mp4'));
    
  if (files.length === 0) {
    console.error(`Error: No .mp4 files found in: ${clipsPath}`);
    process.exit(1);
  }
  
  return sortClipFiles(files).map(file => path.join(clipsPath, file));
}

/**
 * Print merge summary
 */
function printMergeSummary(params) {
  console.log('CS:GO Highlights Merger');
  console.log('=======================');
  console.log(`Clips folder: ${params.clipsPath}`);
  console.log(`Output file: ${params.outputPath}`);
  console.log(`Found ${params.clipCount} clips to merge`);
  if (params.transitionDuration) {
    console.log(`Transitions: ${params.transitionDuration}s fade in/out`);
  }
  if (params.shouldCleanup) {
    console.log('Cleanup: Will delete clips after merging');
  }
}

/**
 * Print completion message
 */
function printMergeCompletion(summary) {
  console.log('\n=======================');
  console.log('Merge Complete!');
  console.log('=======================');
  console.log(`Final video: ${summary.outputFile}`);
  console.log(`Total clips: ${summary.clipCount}`);
  console.log(`Duration: ${summary.durationFormatted}`);
  console.log(`File size: ${summary.fileSizeMB} MB`);
}

module.exports = { mergeCommand };
