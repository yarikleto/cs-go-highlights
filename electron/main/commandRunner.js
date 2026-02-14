const { spawn } = require('child_process');
const path = require('path');

let currentProcess = null;

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

module.exports = {
  runCommand,
  stopCommand,
  isRunning,
};
