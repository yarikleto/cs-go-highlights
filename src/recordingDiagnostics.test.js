import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  appendOutputTail,
  formatHlaeDiagnostics,
  inspectRecordingArtifacts,
} from './recordingDiagnostics.js';

const SUCCESSFUL_LAUNCH = {
  code: 0,
  signal: null,
  durationMs: 12_345,
  output: 'HLAE launcher output',
};

function withTempDirectory(prefix, callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));

  try {
    return callback(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('appendOutputTail bounds captured HLAE output', () => {
  assert.equal(appendOutputTail('1234', Buffer.from('5678'), 5), '45678');
});

test('formatHlaeDiagnostics distinguishes signal termination from a normal exit', () => {
  const diagnostics = formatHlaeDiagnostics({
    code: null,
    signal: 'SIGTERM',
    durationMs: 1_250,
    output: '',
  });

  assert.match(diagnostics, /terminated by signal SIGTERM after 1\.3s/);
  assert.match(diagnostics, /no captured launcher output/);
});

test('inspectRecordingArtifacts explains when HLAE created no take folder', () => {
  withTempDirectory('recording-empty-', directory => {
    assert.throws(
      () => inspectRecordingArtifacts(directory, SUCCESSFUL_LAUNCH),
      error => {
        assert.match(error.message, /No take folders found/);
        assert.match(error.message, /HLAE did not start a recording/);
        assert.match(error.message, /Output folder contents: \(empty\)/);
        assert.match(error.message, /exited with code 0 after 12\.3s/);
        assert.match(error.message, /Recording config loaded/);
        assert.match(error.message, /Recording started/);
        assert.match(error.message, /HLAE launcher output/);
        return true;
      },
    );
  });
});

test('inspectRecordingArtifacts distinguishes a missing stream folder', () => {
  withTempDirectory('recording-no-stream-', directory => {
    const takeFolder = path.join(directory, 'take0000');
    fs.mkdirSync(takeFolder);
    fs.writeFileSync(path.join(takeFolder, 'audio.wav'), 'audio');

    assert.throws(
      () => inspectRecordingArtifacts(directory, SUCCESSFUL_LAUNCH),
      error => {
        assert.match(error.message, /created a take but no video stream/);
        assert.match(error.message, /Take folder contents: audio\.wav/);
        assert.match(error.message, /mirv_streams add normal norm/);
        return true;
      },
    );
  });
});

test('inspectRecordingArtifacts distinguishes a stream with no frames', () => {
  withTempDirectory('recording-no-frames-', directory => {
    const streamFolder = path.join(directory, 'take0000', 'norm');
    fs.mkdirSync(streamFolder, { recursive: true });
    fs.writeFileSync(path.join(streamFolder, 'metadata.txt'), 'metadata');

    assert.throws(
      () => inspectRecordingArtifacts(directory, SUCCESSFUL_LAUNCH),
      error => {
        assert.match(error.message, /stream exists but recorded no frames/);
        assert.match(error.message, /Stream folder contents: metadata\.txt/);
        assert.match(error.message, /demo did not end or crash/);
        return true;
      },
    );
  });
});

test('inspectRecordingArtifacts returns validated paths and prefers the norm stream', () => {
  withTempDirectory('recording-valid-', directory => {
    const takeFolder = path.join(directory, 'take0000');
    const normFolder = path.join(takeFolder, 'norm');
    fs.mkdirSync(path.join(takeFolder, 'other'), { recursive: true });
    fs.mkdirSync(normFolder);
    fs.writeFileSync(path.join(normFolder, '00000.tga'), 'frame');
    fs.writeFileSync(path.join(takeFolder, 'audio.wav'), 'audio');

    const artifacts = inspectRecordingArtifacts(directory, SUCCESSFUL_LAUNCH);

    assert.equal(artifacts.takeFolder, takeFolder);
    assert.equal(artifacts.streamFolder, normFolder);
    assert.deepEqual(artifacts.tgaFiles, ['00000.tga']);
    assert.equal(artifacts.audioFile, path.join(takeFolder, 'audio.wav'));
  });
});
