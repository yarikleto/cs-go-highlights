/**
 * @fileoverview Resync music command - recalculate music times from offsets
 * 
 * After manually editing offsets in music-mapping.json,
 * run this command to recalculate startTime/endTime values.
 */

const path = require('path');
const fs = require('fs');
const { loadMusicMapping, saveMusicMapping, resyncMusicMapping } = require('../../music');
const { validateFileExists } = require('../validators');

/**
 * Main resync-music command handler
 * 
 * @param {Object} options - Command options
 */
async function resyncMusicCommand(options) {
  const mappingPath = path.resolve(options.mapping);
  
  console.log('\n=== Resync Music Mapping ===\n');
  
  // Validate mapping file exists
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
  
  // Find clips with offsets
  const clipsWithOffsets = Object.entries(mapping.clips)
    .filter(([, clip]) => clip.offset && clip.offset !== 0);
  
  if (clipsWithOffsets.length === 0) {
    printNoOffsetsHelp();
    return;
  }
  
  // Print offsets
  printOffsetsFound(clipsWithOffsets);
  
  // Resync
  try {
    console.log('\nRecalculating music times...');
    const updatedMapping = resyncMusicMapping(mapping);
    
    // Save
    saveMusicMapping(mappingPath, updatedMapping);
    
    // Print updated times
    printUpdatedTimes(updatedMapping);
  } catch (error) {
    console.error(`\nError: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Print help message when no offsets found
 */
function printNoOffsetsHelp() {
  console.log('\nNo offsets found. Add "offset" field to clips to shift their music timing.');
  console.log('Example: "offset": 10 will shift music 10 seconds forward');
  console.log('         "offset": -5 will shift music 5 seconds backward');
}

/**
 * Print list of clips with offsets
 * 
 * @param {Array} clipsWithOffsets - Array of [id, clip] entries
 */
function printOffsetsFound(clipsWithOffsets) {
  console.log('\nClips with offsets:');
  for (const [id, clip] of clipsWithOffsets) {
    const sign = clip.offset > 0 ? '+' : '';
    console.log(`  ${id}: ${sign}${clip.offset}s`);
  }
}

/**
 * Print updated music times after resync
 * 
 * @param {Object} mapping - Updated music mapping
 */
function printUpdatedTimes(mapping) {
  console.log('\nMusic mapping updated successfully!');
  console.log('\nUpdated times:');
  
  for (const [id, clip] of Object.entries(mapping.clips)) {
    console.log(`  ${id}: ${clip.startTime} - ${clip.endTime} (${clip.trackFilename})`);
  }
}

module.exports = { resyncMusicCommand };
