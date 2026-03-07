const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let currentProcess = null;
let flowAborted = false;

/**
 * Get the path to the CLI entry point
 */
function getCLIPath() {
  // In development, use the src folder
  // In production, this would be packaged differently
  return path.resolve(__dirname, '../../src/cli/index.js');
}

/**
 * Run a CLI command with options
 * 
 * @param {string} command - Command name (e.g., 'analyze-v2')
 * @param {Object} options - Command options
 * @param {Function} onOutput - Callback for stdout/stderr
 * @param {Function} onComplete - Callback when process completes
 * @returns {Object} Process handle
 */
function runCommand(command, options, onOutput, onComplete) {
  const cliPath = getCLIPath();
  
  // Build arguments array
  const args = ['--experimental-specifier-resolution=node', cliPath, command];
  
  // Add options as CLI flags
  for (const [key, value] of Object.entries(options)) {
    if (value === true) {
      args.push(`--${key}`);
    } else if (value !== false && value !== null && value !== undefined && value !== '') {
      args.push(`--${key}`);
      args.push(String(value));
    }
  }
  
  console.log('[CommandRunner] Spawning: node', args.join(' '));
  
  // Don't use shell: true to avoid issues with paths containing spaces
  currentProcess = spawn('node', args, {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, FORCE_COLOR: '1' },
    windowsHide: true,
  });
  
  currentProcess.stdout.on('data', (data) => {
    const text = data.toString();
    onOutput({ type: 'stdout', text });
  });
  
  currentProcess.stderr.on('data', (data) => {
    const text = data.toString();
    onOutput({ type: 'stderr', text });
  });
  
  currentProcess.on('close', (code) => {
    currentProcess = null;
    onComplete({ code, success: code === 0 });
  });
  
  currentProcess.on('error', (error) => {
    currentProcess = null;
    onComplete({ code: -1, success: false, error: error.message });
  });
  
  return currentProcess;
}

/**
 * Stop the currently running command
 */
function stopCommand() {
  if (currentProcess) {
    const pid = currentProcess.pid;
    
    // On Windows, use taskkill to kill the process tree
    if (process.platform === 'win32') {
      try {
        spawn('taskkill', ['/pid', pid, '/f', '/t'], { 
          detached: true,
          stdio: 'ignore',
        });
      } catch (e) {
        // Fallback to regular kill
        currentProcess.kill();
      }
    } else {
      // On Unix, SIGTERM should work
      currentProcess.kill('SIGTERM');
    }
    
    currentProcess = null;
    return true;
  }
  return false;
}

/**
 * Check if a command is currently running
 */
function isRunning() {
  return currentProcess !== null;
}

/**
 * Resolve "$paramName" placeholders in step options using user-provided params
 */
function resolveOptions(options, params) {
  const resolved = {};
  for (const [key, value] of Object.entries(options)) {
    if (typeof value === 'string' && value.startsWith('$')) {
      const paramName = value.slice(1);
      resolved[key] = params[paramName] ?? value;
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

/**
 * Execute a "clean-dirs" step: remove listed directories
 */
function executeCleanDirs(dirs, onOutput) {
  const cwd = path.resolve(__dirname, '../..');
  for (const dir of dirs) {
    const fullPath = path.resolve(cwd, dir);
    onOutput({ type: 'stdout', text: `Removing ${fullPath} ...\n` });
    try {
      fs.rmSync(fullPath, { recursive: true, force: true });
      onOutput({ type: 'stdout', text: `  Done.\n` });
    } catch (e) {
      onOutput({ type: 'stderr', text: `  Warning: ${e.message}\n` });
    }
  }
}

/**
 * Run a single command step and return a promise that resolves with the result
 */
function runCommandAsync(command, options, onOutput) {
  return new Promise((resolve) => {
    runCommand(command, options, onOutput, resolve);
  });
}

/**
 * Run a full flow (sequence of steps)
 */
async function runFlow(steps, params, onStepStart, onOutput, onStepComplete, onFlowComplete) {
  flowAborted = false;

  for (let i = 0; i < steps.length; i++) {
    if (flowAborted) {
      onFlowComplete({ success: false, stoppedAt: i, error: 'Flow stopped by user' });
      return;
    }

    const step = steps[i];
    onStepStart({ index: i, name: step.name, total: steps.length });

    if (step.type === 'clean-dirs') {
      executeCleanDirs(step.dirs, onOutput);
      onStepComplete({ index: i, name: step.name, success: true, code: 0 });
      continue;
    }

    const options = resolveOptions(step.options || {}, params);
    const result = await runCommandAsync(step.command, options, onOutput);

    onStepComplete({ index: i, name: step.name, ...result });

    if (!result.success) {
      onFlowComplete({ success: false, stoppedAt: i, error: `Step "${step.name}" failed with code ${result.code}` });
      return;
    }
  }

  onFlowComplete({ success: true });
}

/**
 * Stop the currently running flow
 */
function stopFlow() {
  flowAborted = true;
  return stopCommand();
}

module.exports = {
  runCommand,
  stopCommand,
  isRunning,
  runFlow,
  stopFlow,
};
