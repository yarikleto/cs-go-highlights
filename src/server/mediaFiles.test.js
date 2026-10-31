import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertExistingFile,
  describeAudioFiles,
  getMimeType,
  readJsonFile,
  scanClips,
  writeJsonFile,
} from './mediaFiles.js';

async function withTempDir(callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-files-'));
  try {
    return await callback(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function touch(dir, name) {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, 'x');
  return filePath;
}

test('scanClips returns only video files in natural order', async () => {
  await withTempDir(async (dir) => {
    touch(dir, 'clip10.mp4');
    touch(dir, 'clip2.MP4');
    touch(dir, 'notes.txt');

    const clips = await scanClips(dir, { probeDuration: async () => 3 });

    assert.deepEqual(clips, [
      { filename: 'clip2.MP4', path: path.join(dir, 'clip2.MP4'), duration: 3 },
      { filename: 'clip10.mp4', path: path.join(dir, 'clip10.mp4'), duration: 3 },
    ]);
  });
});

test('scanClips reports duration 0 when probing fails', async (t) => {
  t.mock.method(console, 'warn', () => {});
  await withTempDir(async (dir) => {
    touch(dir, 'a.mp4');

    const clips = await scanClips(dir, { probeDuration: async () => { throw new Error('nope'); } });

    assert.equal(clips[0].duration, 0);
  });
});

test('scanClips rejects a path that is not a folder', async () => {
  await withTempDir(async (dir) => {
    const filePath = touch(dir, 'a.mp4');
    await assert.rejects(scanClips(filePath, { probeDuration: async () => 0 }), /Not a folder/);
  });
});

test('describeAudioFiles returns name, path and duration for each file', async () => {
  const files = await describeAudioFiles(['/music/One.mp3'], { probeDuration: async () => 90 });
  assert.deepEqual(files, [{ filename: 'One.mp3', path: '/music/One.mp3', duration: 90 }]);
});

test('assertExistingFile rejects disallowed extensions', async () => {
  await withTempDir(async (dir) => {
    const filePath = touch(dir, 'notes.txt');
    assert.throws(() => assertExistingFile(filePath, { extensions: ['.mp4'] }), /Unsupported file type: \.txt/);
  });
});

test('assertExistingFile returns the resolved path and size', async () => {
  await withTempDir(async (dir) => {
    const filePath = touch(dir, 'a.mp4');
    assert.deepEqual(assertExistingFile(filePath, { extensions: ['.mp4'] }), { resolvedPath: filePath, size: 1 });
  });
});

test('assertExistingFile rejects folders', async () => {
  await withTempDir(async (dir) => {
    assert.throws(() => assertExistingFile(dir), /Not a file/);
  });
});

test('writeJsonFile then readJsonFile round-trips into a new folder', async () => {
  await withTempDir(async (dir) => {
    const target = path.join(dir, 'nested', 'timeline.json');
    assert.equal(writeJsonFile(target, { a: 1 }), target);
    assert.deepEqual(readJsonFile(target), { a: 1 });
  });
});

test('getMimeType maps media extensions case-insensitively', () => {
  assert.equal(getMimeType('/a/B.MP4'), 'video/mp4');
  assert.equal(getMimeType('/a/song.flac'), 'audio/flac');
  assert.equal(getMimeType('/a/file.bin'), 'application/octet-stream');
});
