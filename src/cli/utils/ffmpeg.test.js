import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { probeMediaDurationSeconds } from './ffmpeg.js';

function fakeSpawn({ stdout = '', stderr = '', code = 0, calls = [] }) {
  return (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    setImmediate(() => {
      if (stdout) child.stdout.emit('data', Buffer.from(stdout));
      if (stderr) child.stderr.emit('data', Buffer.from(stderr));
      child.emit('close', code);
    });
    return child;
  };
}

test('probeMediaDurationSeconds parses ffprobe JSON', async () => {
  const calls = [];
  const duration = await probeMediaDurationSeconds('/clips/a b.mp4', {
    spawnProcess: fakeSpawn({ stdout: '{"format":{"duration":"12.5"}}', calls }),
  });

  assert.equal(duration, 12.5);
  assert.equal(calls[0].command, 'ffprobe');
  assert.deepEqual(calls[0].args, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', '/clips/a b.mp4']);
});

test('probeMediaDurationSeconds rejects on non-zero exit', async () => {
  await assert.rejects(
    probeMediaDurationSeconds('/x.mp4', { spawnProcess: fakeSpawn({ stderr: 'bad file', code: 1 }) }),
    /ffprobe failed: bad file/,
  );
});

test('probeMediaDurationSeconds rejects when ffprobe cannot start', async () => {
  const spawnProcess = () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    setImmediate(() => child.emit('error', new Error('spawn ffprobe ENOENT')));
    return child;
  };

  await assert.rejects(probeMediaDurationSeconds('/x.mp4', { spawnProcess }), /Failed to run ffprobe: spawn ffprobe ENOENT/);
});
