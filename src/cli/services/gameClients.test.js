import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseVdf,
  resolveGameClient,
  findSteamLibraries,
  readAppManifest,
  resolveClientInstall,
  verifyClientInstall,
} from './gameClients.js';

function withTempDir(callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'game-clients-'));
  try {
    return callback(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Create <library>/steamapps/{appmanifest_<id>.acf, common/<dir>/csgo.exe, csgo/steam.inf}. */
function installApp(library, { appId, installDir, infAppId = appId, betaKey = null, withExe = true }) {
  const steamapps = path.join(library, 'steamapps');
  const installPath = path.join(steamapps, 'common', installDir);
  fs.mkdirSync(path.join(installPath, 'csgo'), { recursive: true });
  if (withExe) fs.writeFileSync(path.join(installPath, 'csgo.exe'), '');
  fs.writeFileSync(
    path.join(installPath, 'csgo', 'steam.inf'),
    `ClientVersion=2000700\nServerVersion=2000700\nPatchVersion=1.38.8.1\nappID=${infAppId}\n`,
  );
  const beta = betaKey ? `\t"MountedConfig"\n\t{\n\t\t"BetaKey"\t\t"${betaKey}"\n\t}\n` : '';
  fs.writeFileSync(
    path.join(steamapps, `appmanifest_${appId}.acf`),
    `"AppState"\n{\n\t"appid"\t\t"${appId}"\n\t"installdir"\t\t"${installDir}"\n\t"buildid"\t\t"123"\n${beta}}\n`,
  );
  return installPath;
}

test('parseVdf handles nesting, escapes and comments', () => {
  const data = parseVdf(`// comment
"libraryfolders"
{
  "0" { "path" "C:\\\\Program Files (x86)\\\\Steam" "apps" { "730" "1" } }
  "1" { "path" "D:\\\\SteamLibrary" }
}`);
  assert.equal(data.libraryfolders['0'].path, 'C:\\Program Files (x86)\\Steam');
  assert.equal(data.libraryfolders['0'].apps['730'], '1');
  assert.equal(data.libraryfolders['1'].path, 'D:\\SteamLibrary');
});

test('resolveGameClient returns known clients and rejects unknown ids', () => {
  assert.equal(resolveGameClient('legacy').appId, 730);
  assert.equal(resolveGameClient('standalone').appId, 4465480);
  assert.throws(() => resolveGameClient('cs2'), /Unknown game client "cs2".*legacy.*standalone/);
});

test('findSteamLibraries includes the Steam root and libraryfolders.vdf entries', () => {
  withTempDir(dir => {
    const steamRoot = path.join(dir, 'Steam');
    const second = path.join(dir, 'Library2');
    fs.mkdirSync(path.join(steamRoot, 'steamapps'), { recursive: true });
    fs.writeFileSync(
      path.join(steamRoot, 'steamapps', 'libraryfolders.vdf'),
      `"libraryfolders" { "0" { "path" "${steamRoot.replace(/\\/g, '\\\\')}" } "1" { "path" "${second.replace(/\\/g, '\\\\')}" } }`,
    );
    assert.deepEqual(findSteamLibraries(steamRoot), [steamRoot, second]);
  });
});

test('resolveClientInstall finds the standalone client in a secondary library', () => {
  withTempDir(dir => {
    const steamRoot = path.join(dir, 'Steam');
    const second = path.join(dir, 'Library2');
    installApp(steamRoot, { appId: 730, installDir: 'Counter-Strike Global Offensive', betaKey: 'csgo_legacy' });
    const standalonePath = installApp(second, { appId: 4465480, installDir: 'CSGO Standalone' });
    fs.writeFileSync(
      path.join(steamRoot, 'steamapps', 'libraryfolders.vdf'),
      `"libraryfolders" { "0" { "path" "${steamRoot.replace(/\\/g, '\\\\')}" } "1" { "path" "${second.replace(/\\/g, '\\\\')}" } }`,
    );

    const result = resolveClientInstall({ client: resolveGameClient('standalone'), steamRoot });
    assert.equal(result.installPath, standalonePath);
    assert.equal(result.source, 'steam');
    assert.deepEqual(verifyClientInstall({ client: resolveGameClient('standalone'), ...result }).problems, []);
  });
});

test('resolveClientInstall prefers an explicit --csgo folder and attaches its manifest', () => {
  withTempDir(dir => {
    const steamRoot = path.join(dir, 'Steam');
    const legacyPath = installApp(steamRoot, { appId: 730, installDir: 'CSGO', betaKey: 'csgo_legacy' });
    const result = resolveClientInstall({ client: resolveGameClient('legacy'), csgoPath: legacyPath, steamRoot });
    assert.equal(result.source, 'option');
    assert.equal(result.manifest.betaKey, 'csgo_legacy');
  });
});

test('resolveClientInstall explains when the selected client is not installed', () => {
  withTempDir(dir => {
    assert.throws(
      () => resolveClientInstall({ client: resolveGameClient('standalone'), steamRoot: path.join(dir, 'Steam') }),
      /Could not find CS:GO standalone \(app 4465480\).*--csgo/,
    );
  });
});

test('resolveClientInstall falls back to the default folder when Steam has no manifest', () => {
  withTempDir(dir => {
    const result = resolveClientInstall({ client: resolveGameClient('legacy'), steamRoot: path.join(dir, 'Steam'), fallbackPath: dir });
    assert.equal(result.source, 'fallback');
  });
});

test('verifyClientInstall rejects a folder that belongs to the other client', () => {
  withTempDir(dir => {
    const legacyPath = installApp(dir, { appId: 730, installDir: 'CSGO', betaKey: 'csgo_legacy' });
    const { problems } = verifyClientInstall({ client: resolveGameClient('standalone'), installPath: legacyPath });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /selected CS:GO standalone.*contains CS2 \(app 730\).*"legacy" client instead/);
  });
});

test('verifyClientInstall requires the csgo_legacy beta for the 730 client', () => {
  withTempDir(dir => {
    const installPath = installApp(dir, { appId: 730, installDir: 'CSGO', betaKey: 'some_other_beta' });
    const manifest = readAppManifest(dir, 730);
    const { problems } = verifyClientInstall({ client: resolveGameClient('legacy'), installPath, manifest });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /beta branch for app 730 is "some_other_beta", expected "csgo_legacy"/);
  });
});

test('verifyClientInstall reports a missing csgo.exe', () => {
  withTempDir(dir => {
    const installPath = installApp(dir, { appId: 4465480, installDir: 'CSGO', withExe: false });
    const { problems } = verifyClientInstall({ client: resolveGameClient('standalone'), installPath });
    assert.match(problems.join('\n'), /csgo\.exe not found/);
  });
});
