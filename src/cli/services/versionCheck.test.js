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
test('readSteamInf parses versions, PatchVersion protocol and appID (CS2 csgo_legacy beta)', () => {
  const csgoPath = path.join(FIXTURES, 'install-good');
  const result = readSteamInf(csgoPath);
  assert.deepEqual(result, {
    clientVersion: 2000335,
    serverVersion: 2000335,
    patchVersion: '1.38.7.5',
    networkProtocol: 13875,
    appId: 730,
  });
});

test('readSteamInf reads standalone CS:GO (app 4465480) with CRLF line endings', () => {
  const result = readSteamInf(path.join(FIXTURES, 'install-standalone'));
  assert.equal(result.appId, 4465480);
  assert.equal(result.patchVersion, '1.38.8.1');
  assert.equal(result.networkProtocol, 13881);
});

test('readSteamInf returns null protocol when PatchVersion is missing', () => {
  const result = readSteamInf(path.join(FIXTURES, 'install-no-patch'));
  assert.equal(result.patchVersion, null);
  assert.equal(result.networkProtocol, null);
});

test('readSteamInf explains when the folder is a CS2 (Source 2) install', () => {
  assert.throws(() => readSteamInf(path.join(FIXTURES, 'install-cs2')), /contains CS2.*csgo_legacy.*4465480/s);
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
import { readDemoHeader, patchVersionToProtocol, describeGameClient } from './versionCheck.js';

function buildSyntheticDemo(networkProtocol, mapName = 'de_inferno') {
  const buf = Buffer.alloc(1072 + 32, 0); // header + a few junk bytes after
  buf.write('HL2DEMO\0', 0, 'binary');
  buf.writeInt32LE(4, 8);                // demo protocol
  buf.writeInt32LE(networkProtocol, 12); // networkProtocol
  buf.write('Club GOTV', 16, 'utf8');    // server name
  buf.write('GOTV Demo', 276, 'utf8');   // client name
  buf.write(mapName, 536, 'utf8');       // null-padded by Buffer.alloc
  buf.write('csgo', 796, 'utf8');        // game directory
  return buf;
}

test('patchVersionToProtocol strips dots (1.38.8.1 -> 13881)', () => {
  assert.equal(patchVersionToProtocol('1.38.8.1'), 13881);
  assert.equal(patchVersionToProtocol(' 1.37.8.0 '), 13780);
  assert.equal(patchVersionToProtocol(null), null);
  assert.equal(patchVersionToProtocol('abc'), null);
});

test('describeGameClient names both supported clients', () => {
  assert.match(describeGameClient(730), /csgo_legacy/);
  assert.match(describeGameClient(4465480), /standalone/);
  assert.match(describeGameClient(123), /Unknown.*123/);
});

test('readDemoHeader returns networkProtocol and mapName from synthetic header', () => {
  const tmp = path.join(os.tmpdir(), `vcheck-${Date.now()}.dem`);
  fs.writeFileSync(tmp, buildSyntheticDemo(13780, 'de_dust2'));
  try {
    const header = readDemoHeader(tmp);
    assert.equal(header.networkProtocol, 13780);
    assert.equal(header.mapName, 'de_dust2');
    assert.equal(header.serverName, 'Club GOTV');
    assert.equal(header.clientName, 'GOTV Demo');
    assert.equal(header.gameDirectory, 'csgo');
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

test('readDemoHeader explains that CS2 (Source 2) demos are unsupported', () => {
  const tmp = path.join(os.tmpdir(), `vcheck-cs2-${Date.now()}.dem`);
  const buf = Buffer.alloc(1072, 0);
  buf.write('PBDEMS2\0', 0, 'binary');
  fs.writeFileSync(tmp, buf);
  try {
    assert.throws(() => readDemoHeader(tmp), /recorded in CS2/);
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

import { assertVersionCompatibility } from './versionCheck.js';

const EXPECTED_OK = { clientVersion: 2000335, serverVersion: 2000335, networkProtocol: 13753 };

test('assertVersionCompatibility passes when steam.inf and headers all match', () => {
  const csgoPath = path.join(FIXTURES, 'install-good');
  const demoHeaders = [
    { file: 'a.dem', networkProtocol: 13753 },
    { file: 'b.dem', networkProtocol: 13753 },
  ];
  assert.doesNotThrow(() =>
    assertVersionCompatibility({ csgoPath, demoHeaders, expected: EXPECTED_OK }));
});

test('assertVersionCompatibility throws on steam.inf mismatch with helpful reason', () => {
  const csgoPath = path.join(FIXTURES, 'install-good');
  const expected = { ...EXPECTED_OK, clientVersion: 9999999 };
  const demoHeaders = [{ file: 'a.dem', networkProtocol: 13753 }];
  try {
    assertVersionCompatibility({ csgoPath, demoHeaders, expected });
    assert.fail('expected throw');
  } catch (err) {
    assert.equal(err.name, 'VersionMismatchError');
    assert.equal(err.reasons.length, 1);
    assert.match(err.reasons[0], /ClientVersion=2000335.*expected 9999999/);
    assert.match(err.reasons[0], /Steam may have auto-updated/);
  }
});

test('assertVersionCompatibility throws once per demo with networkProtocol mismatch', () => {
  const csgoPath = path.join(FIXTURES, 'install-good');
  const demoHeaders = [
    { file: 'good.dem', networkProtocol: 13753 },
    { file: 'bad.dem',  networkProtocol: 13780 },
  ];
  try {
    assertVersionCompatibility({ csgoPath, demoHeaders, expected: EXPECTED_OK });
    assert.fail('expected throw');
  } catch (err) {
    assert.equal(err.reasons.length, 1);
    assert.match(err.reasons[0], /bad\.dem.*13780.*expected 13753/);
  }
});

const NO_PINS = { clientVersion: null, serverVersion: null, networkProtocol: null };

test('assertVersionCompatibility without pins checks demos against the installed client protocol', () => {
  // install-standalone: PatchVersion 1.38.8.1 -> 13881
  const csgoPath = path.join(FIXTURES, 'install-standalone');
  const result = assertVersionCompatibility({
    csgoPath,
    demoHeaders: [{ file: 'old730.dem', networkProtocol: 13881 }, { file: 'new4465480.dem', networkProtocol: 13881 }],
    expected: NO_PINS,
  });
  assert.equal(result.protocol, 13881);
  assert.equal(result.client.appId, 4465480);
  assert.match(result.clientName, /standalone/);
});

test('assertVersionCompatibility reports demos that do not match the installed client', () => {
  const csgoPath = path.join(FIXTURES, 'install-good'); // 1.38.7.5 -> 13875
  try {
    assertVersionCompatibility({
      csgoPath,
      demoHeaders: [
        { file: 'ok.dem', networkProtocol: 13875 },
        { file: 'newer.dem', networkProtocol: 13881 },
        { file: 'older.dem', networkProtocol: 13780 },
      ],
      expected: NO_PINS,
    });
    assert.fail('expected throw');
  } catch (err) {
    assert.equal(err.name, 'VersionMismatchError');
    assert.equal(err.reasons.length, 2);
    assert.match(err.reasons[0], /newer\.dem.*13881.*csgo_legacy.*expected 13875.*newer than the game/);
    assert.match(err.reasons[1], /older\.dem.*13780.*older than the game/);
  }
});

test('assertVersionCompatibility fails when client protocol cannot be determined', () => {
  const csgoPath = path.join(FIXTURES, 'install-no-patch');
  assert.throws(
    () => assertVersionCompatibility({ csgoPath, demoHeaders: [{ file: 'a.dem', networkProtocol: 13881 }], expected: NO_PINS }),
    /no valid PatchVersion/,
  );
  // An explicit --network-protocol unblocks it.
  assert.doesNotThrow(() => assertVersionCompatibility({
    csgoPath, demoHeaders: [{ file: 'a.dem', networkProtocol: 13881 }], expected: { ...NO_PINS, networkProtocol: 13881 },
  }));
});

test('assertVersionCompatibility rejects demos from another game', () => {
  assert.throws(
    () => assertVersionCompatibility({
      demoHeaders: [{ file: 'tf.dem', networkProtocol: 24, gameDirectory: 'tf' }],
      expected: NO_PINS,
    }),
    /tf\.dem.*"tf", not CS:GO/,
  );
});

test('assertVersionCompatibility without csgoPath and pins only checks batch consistency', () => {
  const csgoPath = undefined;
  const expected = NO_PINS;
  const consistent = [
    { file: 'a.dem', networkProtocol: 13780 },
    { file: 'b.dem', networkProtocol: 13780 },
  ];
  assert.doesNotThrow(() =>
    assertVersionCompatibility({ csgoPath, demoHeaders: consistent, expected }));

  const inconsistent = [
    { file: 'a.dem', networkProtocol: 13753 },
    { file: 'b.dem', networkProtocol: 13780 },
  ];
  try {
    assertVersionCompatibility({ csgoPath, demoHeaders: inconsistent, expected });
    assert.fail('expected throw');
  } catch (err) {
    assert.equal(err.reasons.length, 1);
    assert.match(err.reasons[0], /mixed networkProtocol/);
    assert.match(err.reasons[0], /a\.dem=13753/);
    assert.match(err.reasons[0], /b\.dem=13780/);
  }
});

test('assertVersionCompatibility skips steam.inf when csgoPath is omitted', () => {
  const demoHeaders = [{ file: 'a.dem', networkProtocol: 13753 }];
  assert.doesNotThrow(() =>
    assertVersionCompatibility({ demoHeaders, expected: EXPECTED_OK }));
});

test('assertVersionCompatibility collects multiple reasons in one error', () => {
  const csgoPath = path.join(FIXTURES, 'install-good');
  const expected = { clientVersion: 9999999, serverVersion: 8888888, networkProtocol: 13753 };
  const demoHeaders = [{ file: 'bad.dem', networkProtocol: 13780 }];
  try {
    assertVersionCompatibility({ csgoPath, demoHeaders, expected });
    assert.fail('expected throw');
  } catch (err) {
    assert.equal(err.reasons.length, 3); // client mismatch + server mismatch + demo mismatch
  }
});

import { resolveExpectedVersion } from './versionCheck.js';

const DEFAULTS = { clientVersion: 2000335, serverVersion: 2000335, networkProtocol: null };

test('resolveExpectedVersion treats NaN client/server versions as missing', () => {
  const result = resolveExpectedVersion({ clientVersion: Number.NaN }, DEFAULTS);
  assert.equal(result.clientVersion, 2000335);
});

test('resolveExpectedVersion uses defaults when options are empty', () => {
  assert.deepEqual(resolveExpectedVersion({}, DEFAULTS), DEFAULTS);
});

test('resolveExpectedVersion lets CLI options override defaults', () => {
  const result = resolveExpectedVersion(
    { clientVersion: 9999, serverVersion: 8888, networkProtocol: 13780 },
    DEFAULTS,
  );
  assert.deepEqual(result, { clientVersion: 9999, serverVersion: 8888, networkProtocol: 13780 });
});

test('resolveExpectedVersion preserves networkProtocol=0 (not coerced to default)', () => {
  const result = resolveExpectedVersion({ networkProtocol: 0 }, DEFAULTS);
  assert.equal(result.networkProtocol, 0);
});

test('resolveExpectedVersion treats NaN networkProtocol as missing', () => {
  const result = resolveExpectedVersion({ networkProtocol: Number.NaN }, { ...DEFAULTS, networkProtocol: 13753 });
  assert.equal(result.networkProtocol, 13753);
});
