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
  resolveGameInstall,
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

function writeLibraryFolders(steamRoot, libraries) {
  const entries = libraries
    .map((library, index) => `"${index}" { "path" "${library.replace(/\\/g, '\\\\')}" }`)
    .join(' ');
  fs.mkdirSync(path.join(steamRoot, 'steamapps'), { recursive: true });
  fs.writeFileSync(path.join(steamRoot, 'steamapps', 'libraryfolders.vdf'), `"libraryfolders" { ${entries} }`);
}

/** A game folder copied outside any Steam library, as on a VPS without Steam. */
function copyGameFolder(dir, { appIdLine }) {
  const installPath = path.join(dir, 'games', 'my csgo');
  fs.mkdirSync(path.join(installPath, 'csgo'), { recursive: true });
  fs.writeFileSync(path.join(installPath, 'csgo.exe'), '');
  fs.writeFileSync(path.join(installPath, 'csgo', 'steam.inf'), `ClientVersion=2000700\nServerVersion=2000700\nPatchVersion=1.38.8.1\n${appIdLine}`);
  return installPath;
}

test('resolveGameInstall detects the client from a game folder outside Steam', () => {
  withTempDir(dir => {
    const installPath = copyGameFolder(dir, { appIdLine: 'appID=4465480\n' });

    const result = resolveGameInstall({ csgoPath: installPath, steamRoot: path.join(dir, 'NoSteam') });

    assert.equal(result.client.id, 'standalone');
    assert.equal(result.installPath, installPath);
    assert.equal(result.source, 'option');
    assert.equal(result.manifest, null);
  });
});

test('resolveGameInstall attaches the Steam manifest of an explicit folder', () => {
  withTempDir(dir => {
    const steamRoot = path.join(dir, 'Steam');
    const legacyPath = installApp(steamRoot, { appId: 730, installDir: 'CSGO', betaKey: 'csgo_legacy' });

    const result = resolveGameInstall({ csgoPath: legacyPath, steamRoot });

    assert.equal(result.client.id, 'legacy');
    assert.equal(result.manifest.betaKey, 'csgo_legacy');
  });
});

test('resolveGameInstall keeps an explicitly requested client for an explicit folder', () => {
  withTempDir(dir => {
    const installPath = copyGameFolder(dir, { appIdLine: 'appID=730\n' });

    const result = resolveGameInstall({ clientId: 'standalone', csgoPath: installPath, steamRoot: path.join(dir, 'NoSteam') });

    assert.equal(result.client.id, 'standalone');
    assert.match(verifyClientInstall(result).problems.join('\n'), /selected CS:GO standalone.*contains CS2/);
  });
});

test('resolveGameInstall asks for --client when steam.inf has no appID', () => {
  withTempDir(dir => {
    const installPath = copyGameFolder(dir, { appIdLine: '' });
    assert.throws(
      () => resolveGameInstall({ csgoPath: installPath, steamRoot: path.join(dir, 'NoSteam') }),
      /Cannot tell which CS:GO client.*no appID.*--client legacy.*--client standalone/,
    );
  });
});

test('resolveGameInstall rejects a folder with an unsupported appID', () => {
  withTempDir(dir => {
    const installPath = copyGameFolder(dir, { appIdLine: 'appID=999\n' });
    assert.throws(
      () => resolveGameInstall({ csgoPath: installPath, steamRoot: path.join(dir, 'NoSteam') }),
      /appID 999.*not a supported client/,
    );
  });
});

test('resolveGameInstall finds the only installed client in the Steam libraries', () => {
  withTempDir(dir => {
    const steamRoot = path.join(dir, 'Steam');
    const second = path.join(dir, 'Library2');
    const standalonePath = installApp(second, { appId: 4465480, installDir: 'CSGO Standalone' });
    writeLibraryFolders(steamRoot, [steamRoot, second]);

    const result = resolveGameInstall({ steamRoot });

    assert.equal(result.client.id, 'standalone');
    assert.equal(result.installPath, standalonePath);
    assert.equal(result.source, 'steam');
    assert.deepEqual(verifyClientInstall(result).problems, []);
  });
});

test('resolveGameInstall asks to choose when both clients are installed', () => {
  withTempDir(dir => {
    const steamRoot = path.join(dir, 'Steam');
    installApp(steamRoot, { appId: 730, installDir: 'Counter-Strike Global Offensive', betaKey: 'csgo_legacy' });
    installApp(steamRoot, { appId: 4465480, installDir: 'CSGO Standalone' });

    assert.throws(() => resolveGameInstall({ steamRoot }), /Both .* are installed.*--csgo.*--client/s);
  });
});

test('resolveGameInstall prefers standalone when CS2 is installed without the csgo_legacy beta', () => {
  withTempDir(dir => {
    const steamRoot = path.join(dir, 'Steam');
    installApp(steamRoot, { appId: 730, installDir: 'Counter-Strike Global Offensive' });
    const standalonePath = installApp(steamRoot, { appId: 4465480, installDir: 'CSGO Standalone' });

    const result = resolveGameInstall({ steamRoot });

    assert.equal(result.client.id, 'standalone');
    assert.equal(result.installPath, standalonePath);
  });
});

test('resolveGameInstall still returns an unusable install when it is the only one, so verification can explain it', () => {
  withTempDir(dir => {
    const steamRoot = path.join(dir, 'Steam');
    installApp(steamRoot, { appId: 730, installDir: 'Counter-Strike Global Offensive' });

    const result = resolveGameInstall({ steamRoot });

    assert.equal(result.client.id, 'legacy');
    assert.match(verifyClientInstall(result).problems.join('\n'), /expected "csgo_legacy"/);
  });
});

test('resolveGameInstall uses the requested client when both are installed', () => {
  withTempDir(dir => {
    const steamRoot = path.join(dir, 'Steam');
    const legacyPath = installApp(steamRoot, { appId: 730, installDir: 'Counter-Strike Global Offensive', betaKey: 'csgo_legacy' });
    installApp(steamRoot, { appId: 4465480, installDir: 'CSGO Standalone' });

    const result = resolveGameInstall({ clientId: 'legacy', steamRoot });

    assert.equal(result.installPath, legacyPath);
  });
});

test('resolveGameInstall asks for --csgo when no client is found in Steam', () => {
  withTempDir(dir => {
    assert.throws(
      () => resolveGameInstall({ steamRoot: path.join(dir, 'Steam') }),
      /Could not find a CS:GO client in your Steam libraries.*--csgo/,
    );
  });
});

test('resolveGameInstall names the requested client when it is not installed', () => {
  withTempDir(dir => {
    assert.throws(
      () => resolveGameInstall({ clientId: 'standalone', steamRoot: path.join(dir, 'Steam') }),
      /Could not find CS:GO standalone \(app 4465480\).*--csgo/,
    );
  });
});

test('resolveGameInstall rejects an unknown client id', () => {
  withTempDir(dir => {
    assert.throws(() => resolveGameInstall({ clientId: 'cs2', steamRoot: dir }), /Unknown game client "cs2"/);
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
