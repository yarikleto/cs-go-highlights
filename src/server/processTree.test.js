import test from 'node:test';
import assert from 'node:assert/strict';
import { killProcessTree } from './processTree.js';

test('killProcessTree uses taskkill for the whole tree on Windows', () => {
  const calls = [];
  const child = { pid: 77, kill: () => calls.push('kill') };

  killProcessTree(child, {
    platform: 'win32',
    spawnProcess: (command, args, options) => {
      calls.push({ command, args, options });
      return { on() {} };
    },
  });

  assert.deepEqual(calls, [{
    command: 'taskkill',
    args: ['/pid', '77', '/f', '/t'],
    options: { detached: true, stdio: 'ignore', windowsHide: true },
  }]);
});

test('killProcessTree sends SIGTERM elsewhere', () => {
  const signals = [];
  killProcessTree({ pid: 1, kill: (signal) => signals.push(signal) }, { platform: 'darwin' });
  assert.deepEqual(signals, ['SIGTERM']);
});
