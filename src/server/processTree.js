import { spawn } from 'node:child_process';

/** On Windows the CLI spawns ffmpeg/HLAE children that a plain kill() would leave running. */
export function killProcessTree(child, { platform = process.platform, spawnProcess = spawn } = {}) {
  if (platform !== 'win32') {
    child.kill('SIGTERM');
    return;
  }

  const taskkill = spawnProcess('taskkill', ['/pid', String(child.pid), '/f', '/t'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  taskkill.on('error', () => child.kill());
}
