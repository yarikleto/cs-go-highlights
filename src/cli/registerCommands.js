/**
 * @fileoverview Register CLI commands from shared config
 * 
 * This module bridges the shared command config with commander.js
 */

import { COMMANDS } from '../shared/commandsConfig.js';

/**
 * Map command ID to action handler
 */
const ACTION_MAP = {
  'extract': 'extractCommand',
  'analyze': 'analyzeCommand',
  'analyze-v2': 'analyzeV2Command',
  'analyze-postprocess-ui': 'analyzePostprocessUICommand',
  'record': 'recordCommand',
  'postprocess-ui': 'postprocessUICommand',
  'postprocess-sound': 'postprocessSoundCommand',
  'merge': 'mergeCommand',
  'top': 'topCommand',
  'players': 'playersCommand',
  'player-kills': 'playerKillsCommand',
  'compress': 'compressCommand',
  'timestamps': 'timestampsCommand',
  'resync-music': 'resyncMusicCommand',
  'merge-music': 'mergeMusicCommand',
  'apply-music': 'applyMusicCommand',
};

/**
 * Register a single command from config
 */
function registerCommand(program, commandConfig, actions) {
  const cmd = program.command(commandConfig.id);
  cmd.description(commandConfig.description);
  
  // Add options
  for (const opt of commandConfig.options || []) {
    const flagName = opt.name;
    const flag = opt.required 
      ? `--${flagName} <value>` 
      : `--${flagName} ${opt.type === 'boolean' ? '' : '<value>'}`;
    
    // Build description
    let desc = opt.description || opt.label;
    
    // Handle different types
    if (opt.type === 'number') {
      if (opt.required) {
        cmd.requiredOption(flag, desc, (val) => parseFloat(val), opt.default);
      } else {
        cmd.option(flag, desc, (val) => parseFloat(val), opt.default);
      }
    } else if (opt.type === 'boolean') {
      // Boolean flags don't have <value>
      const boolFlag = `--${flagName}`;
      cmd.option(boolFlag, desc, opt.default);
    } else if (opt.type === 'select') {
      const choiceValues = (opt.choices || []).map(c => c.value).filter(v => v);
      if (choiceValues.length > 0) {
        desc += ` (${choiceValues.join(', ')})`;
      }
      if (opt.required) {
        cmd.requiredOption(flag, desc, opt.default);
      } else {
        cmd.option(flag, desc, opt.default);
      }
    } else {
      // text, file, folder - all are strings
      if (opt.required) {
        cmd.requiredOption(flag, desc, opt.default);
      } else {
        cmd.option(flag, desc, opt.default);
      }
    }
  }
  
  // Add action handler
  const actionName = ACTION_MAP[commandConfig.id];
  if (actionName && actions[actionName]) {
    cmd.action(actions[actionName]);
  } else {
    console.warn(`Warning: No action handler for command "${commandConfig.id}"`);
  }
  
  return cmd;
}

/**
 * Register all commands from shared config
 * 
 * @param {import('commander').Command} program - Commander program instance
 * @param {Object} actions - Map of action handlers
 */
export function registerAllCommands(program, actions) {
  for (const commandConfig of COMMANDS) {
    registerCommand(program, commandConfig, actions);
  }
}

/**
 * Export for potential direct use
 */
export { COMMANDS };
