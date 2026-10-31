import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  startGameConsoleCapture,
  readCapturedConsole,
  summarizeConsole,
  saveRunLogs,
} from './gameConsoleLog.js';
import { formatHlaeDiagnostics } from './recordingDiagnostics.js';

function withGameDir(callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'game-console-'));
  fs.mkdirSync(path.join(dir, 'csgo'));
  try {
    return callback(dir, path.join(dir, 'csgo', 'console.log'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('readCapturedConsole returns only what the game appended during this run', () => {
  withGameDir((csgoPath, logPath) => {
    fs.writeFileSync(logPath, 'previous run\n');
    const capture = startGameConsoleCapture(csgoPath);
    fs.appendFileSync(logPath, 'this run line 1\nthis run line 2\n');
    assert.equal(readCapturedConsole(capture), 'this run line 1\nthis run line 2\n');
  });
});

test('readCapturedConsole reads from the top when the game truncated console.log', () => {
  withGameDir((csgoPath, logPath) => {
    fs.writeFileSync(logPath, 'a long previous run '.repeat(10));
    const capture = startGameConsoleCapture(csgoPath);
    fs.writeFileSync(logPath, 'fresh\n');
    assert.equal(readCapturedConsole(capture), 'fresh\n');
  });
});

test('readCapturedConsole returns null when the game wrote no console.log', () => {
  withGameDir((csgoPath) => {
    assert.equal(readCapturedConsole(startGameConsoleCapture(csgoPath)), null);
  });
});

test('summarizeConsole extracts problem lines and the tail', () => {
  const { problemLines, tailLines } = summarizeConsole(
    'Loading demo\nUnknown command "mirv_foo"\nok\nCouldn\'t exec hlae_record_1.cfg\nDemo playback finished\n',
  );
  assert.deepEqual(problemLines, ['Unknown command "mirv_foo"', "Couldn't exec hlae_record_1.cfg"]);
  assert.equal(tailLines.at(-1), 'Demo playback finished');
});

test('saveRunLogs writes console and HLAE logs, and diagnostics point at them', () => {
  withGameDir((csgoPath, logPath) => {
    const capture = startGameConsoleCapture(csgoPath);
    fs.writeFileSync(logPath, 'playdemo started\nERROR: Failed to load map\n');
    const logDir = path.join(csgoPath, 'logs');

    const logs = saveRunLogs({
      capture,
      logDir,
      logName: '1-de_mirage-abc',
      details: { 'Game client': 'CS:GO standalone (app 4465480)' },
      hlaeOutput: 'hlae said hi',
    });

    assert.equal(logs.error, null);
    const consoleLog = fs.readFileSync(logs.consoleLogPath, 'utf8');
    assert.match(consoleLog, /# Game client: CS:GO standalone \(app 4465480\)/);
    assert.match(consoleLog, /ERROR: Failed to load map/);
    assert.match(fs.readFileSync(logs.hlaeLogPath, 'utf8'), /hlae said hi/);

    const diagnostics = formatHlaeDiagnostics({ code: 1, signal: null, durationMs: 1000, output: '', logs });
    assert.match(diagnostics, /Game console log: .*1-de_mirage-abc\.console\.log/);
    assert.match(diagnostics, /Game console problems:\n  ERROR: Failed to load map/);
  });
});

test('saveRunLogs notes when the game produced no console output', () => {
  withGameDir((csgoPath) => {
    const logs = saveRunLogs({
      capture: startGameConsoleCapture(csgoPath),
      logDir: path.join(csgoPath, 'logs'),
      logName: 'run',
      details: {},
      hlaeOutput: '',
    });
    assert.equal(logs.consoleCaptured, false);
    assert.match(fs.readFileSync(logs.consoleLogPath, 'utf8'), /did not write/);
    assert.match(formatHlaeDiagnostics({ code: 0, durationMs: 1, output: '', logs }), /wrote no console output/);
  });
});
