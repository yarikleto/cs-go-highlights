import test from 'node:test';
import assert from 'node:assert/strict';
import { VersionMismatchError } from './versionCheck.js';

test('VersionMismatchError carries reasons array and joins them in message', () => {
  const err = new VersionMismatchError(['reason A', 'reason B']);
  assert.ok(err instanceof Error);
  assert.equal(err.name, 'VersionMismatchError');
  assert.deepEqual(err.reasons, ['reason A', 'reason B']);
  assert.match(err.message, /reason A/);
  assert.match(err.message, /reason B/);
});

test('VersionMismatchError requires at least one reason', () => {
  assert.throws(() => new VersionMismatchError([]), /at least one reason/i);
});

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSteamInf } from './versionCheck.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, '../../../tests/fixtures');

// readSteamInf treats csgoPath as the install root: <csgoPath>/csgo/steam.inf
// For tests we point csgoPath at a directory whose `csgo/` child is the fixture.
test('readSteamInf parses ClientVersion and ServerVersion as integers', () => {
  const csgoPath = path.join(FIXTURES, 'install-good');
  const result = readSteamInf(csgoPath);
  assert.deepEqual(result, { clientVersion: 2000335, serverVersion: 2000335 });
});

test('readSteamInf throws when steam.inf is missing required key', () => {
  const csgoPath = path.join(FIXTURES, 'install-missing-key');
  assert.throws(() => readSteamInf(csgoPath), /ClientVersion/);
});

test('readSteamInf throws when steam.inf file does not exist', () => {
  const csgoPath = path.join(FIXTURES, 'install-nonexistent');
  assert.throws(() => readSteamInf(csgoPath), /steam\.inf/);
});

import os from 'node:os';
import fs from 'node:fs';
import { readDemoHeader } from './versionCheck.js';

function buildSyntheticDemo(networkProtocol, mapName = 'de_inferno') {
  const buf = Buffer.alloc(1072 + 32, 0); // header + a few junk bytes after
  buf.write('HL2DEMO\0', 0, 'binary');
  buf.writeInt32LE(4, 8);                // demo protocol
  buf.writeInt32LE(networkProtocol, 12); // networkProtocol
  buf.write(mapName, 536, 'utf8');       // null-padded by Buffer.alloc
  return buf;
}

test('readDemoHeader returns networkProtocol and mapName from synthetic header', () => {
  const tmp = path.join(os.tmpdir(), `vcheck-${Date.now()}.dem`);
  fs.writeFileSync(tmp, buildSyntheticDemo(13780, 'de_dust2'));
  try {
    const header = readDemoHeader(tmp);
    assert.equal(header.networkProtocol, 13780);
    assert.equal(header.mapName, 'de_dust2');
    assert.equal(header.file, path.basename(tmp));
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('readDemoHeader rejects file with wrong magic', () => {
  const tmp = path.join(os.tmpdir(), `vcheck-bad-${Date.now()}.dem`);
  const buf = Buffer.alloc(1072, 0);
  buf.write('NOTADEMO', 0, 'binary');
  fs.writeFileSync(tmp, buf);
  try {
    assert.throws(() => readDemoHeader(tmp), /not a CS:GO demo|magic/i);
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('readDemoHeader throws when file is shorter than header', () => {
  const tmp = path.join(os.tmpdir(), `vcheck-short-${Date.now()}.dem`);
  fs.writeFileSync(tmp, Buffer.alloc(100, 0));
  try {
    assert.throws(() => readDemoHeader(tmp), /header|too short/i);
  } finally {
    fs.unlinkSync(tmp);
  }
});
