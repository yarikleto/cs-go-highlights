/**
 * @fileoverview Common validation functions for CLI commands
 * 
 * Centralizes validation logic to ensure consistent error messages
 * and avoid code duplication across commands.
 * 
 * Pattern: Each validator either succeeds silently or exits with error message.
 */

import fs from 'fs';
import path from 'path';

/**
 * Validate that a file exists
 * Exits process with error if file not found
 * 
 * @param {string} filePath - Path to validate
 * @param {string} description - Human-readable description for error message
 */
function validateFileExists(filePath, description) {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Error: ${description} not found: ${resolvedPath}`);
    process.exit(1);
  }
  return resolvedPath;
}

/**
 * Validate that a directory exists
 * Exits process with error if directory not found
 * 
 * @param {string} dirPath - Path to validate
 * @param {string} description - Human-readable description for error message
 */
function validateDirExists(dirPath, description) {
  const resolvedPath = path.resolve(dirPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Error: ${description} not found: ${resolvedPath}`);
    process.exit(1);
  }
  return resolvedPath;
}

/**
 * Ensure a directory exists, creating it if necessary
 * 
 * @param {string} dirPath - Path to ensure
 * @returns {string} Resolved path
 */
function ensureDir(dirPath) {
  const resolvedPath = path.resolve(dirPath);
  if (!fs.existsSync(resolvedPath)) {
    fs.mkdirSync(resolvedPath, { recursive: true });
  }
  return resolvedPath;
}

/**
 * Parse and validate a JSON file
 * Exits process with error if parsing fails
 * 
 * @param {string} filePath - Path to JSON file
 * @param {string} description - Human-readable description for error message
 * @returns {Object} Parsed JSON content
 */
function parseJsonFile(filePath, description) {
  const resolvedPath = validateFileExists(filePath, description);
  try {
    const content = fs.readFileSync(resolvedPath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`Error: Failed to parse ${description}: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Find all files with a specific extension in a directory
 * Exits process if no files found
 * 
 * @param {string} dirPath - Directory to search
 * @param {string} extension - File extension (e.g., '.dem', '.mp4')
 * @param {string} description - Description for error message
 * @returns {string[]} Array of full file paths
 */
function findFilesByExtension(dirPath, extension, description) {
  const resolvedPath = validateDirExists(dirPath, description);
  const files = fs.readdirSync(resolvedPath)
    .filter(file => file.endsWith(extension))
    .map(file => path.join(resolvedPath, file));
    
  if (files.length === 0) {
    console.error(`Error: No ${extension} files found in: ${resolvedPath}`);
    process.exit(1);
  }
  
  return files;
}

/**
 * Validate a numeric value is within range
 * Exits process with error if out of range
 * 
 * @param {number} value - Value to validate
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @param {string} description - Description for error message
 */
function validateRange(value, min, max, description) {
  if (isNaN(value) || value < min || value > max) {
    console.error(`Error: ${description} must be between ${min} and ${max}`);
    process.exit(1);
  }
  return value;
}

/**
 * Build a mapping of highlight ID -> highlight data from highlights.json
 * Useful for looking up highlight metadata during processing
 * 
 * @param {Object} highlightsData - Parsed highlights.json content
 * @returns {Map<string, Object>} Map of highlight ID to highlight data
 */
function buildHighlightMap(highlightsData) {
  const map = {};
  for (const demo of highlightsData.demos) {
    for (const highlight of demo.highlights) {
      map[highlight.id] = {
        ...highlight,
        demoFile: demo.file,
        tickRate: demo.tickRate,
      };
    }
  }
  return map;
}

/**
 * Sort clip files numerically by their index prefix
 * E.g., "1-map-id.mp4", "2-map-id.mp4", "10-map-id.mp4"
 * 
 * @param {string[]} files - Array of filenames
 * @returns {string[]} Sorted filenames
 */
function sortClipFiles(files) {
  return files.sort((a, b) => {
    const numA = parseInt(a.split('-')[0], 10) || 0;
    const numB = parseInt(b.split('-')[0], 10) || 0;
    return numA - numB;
  });
}

/**
 * Extract highlight ID from clip filename
 * Filename format: "1-de_dust2-abc123def456.mp4"
 * 
 * @param {string} filename - Clip filename
 * @returns {string|null} Highlight ID or null if not found
 */
function extractHighlightId(filename) {
  const match = filename.match(/-([a-f0-9]{12})\.mp4$/i);
  return match ? match[1] : null;
}

export {
  validateFileExists,
  validateDirExists,
  ensureDir,
  parseJsonFile,
  findFilesByExtension,
  validateRange,
  buildHighlightMap,
  sortClipFiles,
  extractHighlightId,
};
