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
