/**
 * Command registry for Electron UI
 * 
 * Loads command definitions from the shared config (src/shared/commands.json)
 * This ensures CLI and Electron UI are always in sync.
 * 
 * Option types:
 * - folder: Folder picker
 * - file: File picker with optional filters
 * - text: Text input
 * - number: Number input
 * - boolean: Checkbox
 * - select: Dropdown with choices
 */

const path = require('path');
const fs = require('fs');

// Try to load from shared config
function loadCommands() {
  // In development: relative path from electron/main/ to src/shared/
  const devPath = path.resolve(__dirname, '../../src/shared/commands.json');
  
  // In production (packaged): resources/src/shared/commands.json
  const prodPath = path.resolve(process.resourcesPath || '', 'src/shared/commands.json');
  
  let configPath = devPath;
  if (!fs.existsSync(devPath) && fs.existsSync(prodPath)) {
    configPath = prodPath;
  }
  
  try {
    const data = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to load commands config:', err.message);
    console.error('Tried paths:', devPath, prodPath);
    return [];
  }
}

const COMMANDS = loadCommands();

module.exports = { COMMANDS };
