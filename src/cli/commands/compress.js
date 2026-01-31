/**
 * @fileoverview Compress command - reduce video file size
 * 
 * Uses FFmpeg to re-encode video with configurable compression level.
 * Power level 1-10 maps to CRF 18-36.
 */

import path from 'path';
import fs from 'fs';
import { runFfmpegCompress, powerToCrf } from '../utils/ffmpeg.js';
import { validateFileExists, validateRange } from '../validators.js';

/**
 * Main compress command handler
 * 
 * @param {Object} options - Command options
 */
async function compressCommand(options) {
  const inputPath = validateFileExists(options.input, 'Input file');
  const power = validateRange(parseInt(options.power, 10), 1, 10, 'Compression power');
  
  // Generate output path
  const outputPath = options.output 
    ? path.resolve(options.output)
    : generateOutputPath(inputPath);
  
  // Map power to CRF
  const crf = powerToCrf(power);
  
  // Get input file size
  const inputStats = fs.statSync(inputPath);
  const inputSizeMB = (inputStats.size / (1024 * 1024)).toFixed(2);
  
  // Print summary
  printCompressSummary({
    inputPath,
    outputPath,
    power,
    crf,
    inputSizeMB,
  });
  
  try {
    await runFfmpegCompress(inputPath, outputPath, crf);
    
    // Get output file size and print results
    const outputStats = fs.statSync(outputPath);
    const outputSizeMB = (outputStats.size / (1024 * 1024)).toFixed(2);
    const reduction = (((inputStats.size - outputStats.size) / inputStats.size) * 100).toFixed(1);
    
    printCompressCompletion({
      outputPath,
      inputSizeMB,
      outputSizeMB,
      reduction,
    });
  } catch (err) {
    console.error(`\nError during compression: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Generate default output path with _compressed suffix
 * 
 * @param {string} inputPath - Input file path
 * @returns {string} Output file path
 */
function generateOutputPath(inputPath) {
  const inputDir = path.dirname(inputPath);
  const inputName = path.basename(inputPath, path.extname(inputPath));
  return path.join(inputDir, `${inputName}_compressed.mp4`);
}

/**
 * Print compression summary
 */
function printCompressSummary(params) {
  console.log('CS:GO Highlights Compressor');
  console.log('===========================');
  console.log(`Input: ${params.inputPath}`);
  console.log(`Output: ${params.outputPath}`);
  console.log(`Power: ${params.power}/10 (CRF: ${params.crf})`);
  console.log(`Input size: ${params.inputSizeMB} MB`);
  console.log('');
  console.log('Compressing video...');
}

/**
 * Print compression results
 */
function printCompressCompletion(params) {
  console.log('\n===========================');
  console.log('Compression Complete!');
  console.log('===========================');
  console.log(`Output: ${params.outputPath}`);
  console.log(`Original size: ${params.inputSizeMB} MB`);
  console.log(`Compressed size: ${params.outputSizeMB} MB`);
  console.log(`Size reduction: ${params.reduction}%`);
}

export { compressCommand };
