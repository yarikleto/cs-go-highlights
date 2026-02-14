/**
 * @fileoverview Shared command configuration for CLI and Electron UI
 * 
 * This is the single source of truth for all command options.
 * Both CLI (commander.js) and Electron UI use this config.
 * 
 * The actual command definitions are stored in commands.json
 * This file provides ESM exports and helper functions.
 * 
 * Option types:
 * - folder: Folder picker (CLI: string path)
 * - file: File picker with optional filters (CLI: string path)
 * - text: Text input (CLI: string)
 * - number: Number input (CLI: parsed as number)
 * - boolean: Checkbox (CLI: flag)
 * - select: Dropdown with choices (CLI: string from choices)
 * 
 * To add/modify commands, edit src/shared/commands.json
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Load commands from JSON (single source of truth)
export const COMMANDS = require('./commands.json');

/**
 * Get command by ID
 */
export function getCommand(id) {
  return COMMANDS.find(cmd => cmd.id === id);
}

/**
 * Get all commands in a category
 */
export function getCommandsByCategory(category) {
  return COMMANDS.filter(cmd => cmd.category === category);
}
