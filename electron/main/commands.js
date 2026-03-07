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

function loadJsonConfig(filename) {
  const devPath = path.resolve(__dirname, '../../src/shared/', filename);
  const prodPath = path.resolve(process.resourcesPath || '', 'src/shared/', filename);

  let configPath = devPath;
  if (!fs.existsSync(devPath) && fs.existsSync(prodPath)) {
    configPath = prodPath;
  }

  try {
    const data = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Failed to load ${filename}:`, err.message);
    return [];
  }
}

const COMMANDS = loadJsonConfig('commands.json');
const FLOWS = loadJsonConfig('flows.json');

module.exports = { COMMANDS, FLOWS };
