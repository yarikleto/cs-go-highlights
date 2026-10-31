/**
 * @fileoverview Game client selection for recording.
 *
 * Recording launches a real CS:GO client through HLAE (see GAME_CLIENTS in
 * src/config.js):
 *
 *   - legacy:     CS2 (app 730) with the `csgo_legacy` beta branch
 *   - standalone: Counter-Strike: Global Offensive (app 4465480)
 *
 * The install folder comes from `--csgo`, and the client is read from its
 * csgo/steam.inf. Without `--csgo`, the folder is located through the Steam
 * library manifests (steamapps/appmanifest_<appId>.acf). The folder is then
 * verified to really be that client before anything is launched.
 */

import fs from 'node:fs';
import path from 'node:path';
import { GAME_CLIENTS } from '../../config.js';
import { readSteamInf, describeGameClient } from './versionCheck.js';

/**
 * Minimal Valve KeyValues (VDF/ACF) parser: quoted keys, quoted values,
 * nested `{ }` blocks, `//` comments. Keys are kept as written.
 *
 * @param {string} text
 * @returns {Object}
 */
export function parseVdf(text) {
  const tokenRe = /"((?:[^"\\]|\\.)*)"|([{}])|\/\/[^\n]*/g;
  const root = {};
  const stack = [root];
  let pendingKey = null;
  let match;
  while ((match = tokenRe.exec(text)) !== null) {
    if (match[1] !== undefined) {
      const str = match[1].replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
      if (pendingKey === null) {
        pendingKey = str;
      } else {
        stack[stack.length - 1][pendingKey] = str;
        pendingKey = null;
      }
    } else if (match[2] === '{') {
      const child = {};
      stack[stack.length - 1][pendingKey ?? ''] = child;
      stack.push(child);
      pendingKey = null;
    } else if (match[2] === '}') {
      if (stack.length > 1) stack.pop();
      pendingKey = null;
    }
  }
  return root;
}

/** Case-insensitive key lookup (VDF keys are case-insensitive). */
function vdfGet(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined;
  const wanted = key.toLowerCase();
  const found = Object.keys(obj).find(k => k.toLowerCase() === wanted);
  return found === undefined ? undefined : obj[found];
}

const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/**
 * Look up a client by id.
 *
 * @param {string} clientId e.g. 'legacy' or 'standalone'
 * @returns {typeof GAME_CLIENTS[keyof typeof GAME_CLIENTS]}
 */
export function resolveGameClient(clientId) {
  const client = GAME_CLIENTS[clientId];
  if (!client) {
    const choices = Object.values(GAME_CLIENTS).map(c => `${c.id} (${c.label})`).join(', ');
    throw new Error(`Unknown game client "${clientId}". Choose one of: ${choices}`);
  }
  return client;
}

/**
 * All Steam library folders: the Steam root plus everything listed in
 * steamapps/libraryfolders.vdf. Missing files are ignored.
 *
 * @param {string} steamRoot
 * @returns {string[]}
 */
export function findSteamLibraries(steamRoot) {
  const libraries = [];
  const add = (p) => {
    if (p && !libraries.some(existing => samePath(existing, p))) libraries.push(p);
  };
  add(steamRoot);

  for (const vdfPath of [
    path.join(steamRoot, 'steamapps', 'libraryfolders.vdf'),
    path.join(steamRoot, 'config', 'libraryfolders.vdf'),
  ]) {
    if (!fs.existsSync(vdfPath)) continue;
    const folders = vdfGet(parseVdf(fs.readFileSync(vdfPath, 'utf8')), 'libraryfolders') || {};
    for (const entry of Object.values(folders)) {
      // New format: "0" { "path" "D:\\SteamLibrary" ... }; old format: "1" "D:\\SteamLibrary"
      add(typeof entry === 'string' ? entry : vdfGet(entry, 'path'));
    }
  }
  return libraries;
}

/**
 * Read steamapps/appmanifest_<appId>.acf from one library.
 *
 * @param {string} libraryPath
 * @param {number} appId
 * @returns {{ manifestPath: string, installPath: string, betaKey: string|null, buildId: string|null }|null}
 */
export function readAppManifest(libraryPath, appId) {
  const manifestPath = path.join(libraryPath, 'steamapps', `appmanifest_${appId}.acf`);
  if (!fs.existsSync(manifestPath)) return null;

  const state = vdfGet(parseVdf(fs.readFileSync(manifestPath, 'utf8')), 'AppState');
  const installDir = vdfGet(state, 'installdir');
  if (!installDir) return null;

  // MountedConfig = what is on disk; UserConfig = what the user selected.
  const betaKey = vdfGet(vdfGet(state, 'MountedConfig'), 'BetaKey')
    ?? vdfGet(vdfGet(state, 'UserConfig'), 'BetaKey')
    ?? null;

  return {
    manifestPath,
    installPath: path.join(libraryPath, 'steamapps', 'common', installDir),
    betaKey: betaKey || null,
    buildId: vdfGet(state, 'buildid') ?? null,
  };
}

/**
 * Pick the client and the folder to launch. An explicit folder (`--csgo`) decides
 * the client through the appID in its csgo/steam.inf, so a game copied outside
 * Steam (e.g. on a VPS) works without `--client`. Without a folder, the Steam
 * libraries are searched for the requested client, or for any supported one.
 *
 * @param {Object} args
 * @param {string} [args.clientId] Optional `--client`; narrows the search or overrides detection.
 * @param {string} [args.csgoPath] Optional `--csgo` install folder (contains csgo.exe).
 * @param {string} args.steamRoot Steam install folder used to find libraries.
 * @returns {{ client: Object, installPath: string, source: 'option'|'steam', manifest: ReturnType<typeof readAppManifest> }}
 */
export function resolveGameInstall({ clientId, csgoPath, steamRoot }) {
  const requestedClient = clientId ? resolveGameClient(clientId) : null;
  const libraries = findSteamLibraries(steamRoot);

  if (csgoPath) {
    const installPath = path.resolve(csgoPath);
    const client = requestedClient ?? detectClientInFolder(installPath);
    const manifest = findManifests(libraries, client).find(m => samePath(m.installPath, installPath)) ?? null;
    return { client, installPath, source: 'option', manifest };
  }

  const candidates = requestedClient ? [requestedClient] : Object.values(GAME_CLIENTS);
  const found = candidates
    .map(client => ({ client, manifest: findManifests(libraries, client).find(m => fs.existsSync(m.installPath)) }))
    .filter(({ manifest }) => manifest);
  const installed = preferUsableInstalls(found);

  if (installed.length > 1) {
    const found = installed.map(({ client, manifest }) => `${client.label} in ${manifest.installPath}`).join('; ');
    throw new Error(`Both CS:GO clients are installed (${found}). Choose one with --csgo <folder> or --client <id>.`);
  }

  if (installed.length === 0) {
    const what = requestedClient ? requestedClient.label : 'a CS:GO client';
    throw new Error(
      `Could not find ${what} in your Steam libraries (${libraries.join(', ')}). ` +
      'Pass --csgo <folder> with the game\'s install folder (the one that contains csgo.exe).'
    );
  }

  const [{ client, manifest }] = installed;
  return { client, installPath: manifest.installPath, source: 'steam', manifest };
}

/**
 * Most players keep plain CS2 (app 730 without the csgo_legacy beta) installed next to
 * standalone CS:GO; only installs that pass verification count when choosing. If none
 * pass, all are kept so verification can explain what is wrong with them.
 */
function preferUsableInstalls(installs) {
  const usable = installs.filter(({ client, manifest }) => (
    verifyClientInstall({ client, installPath: manifest.installPath, manifest }).problems.length === 0
  ));
  return usable.length > 0 ? usable : installs;
}

function findManifests(libraries, client) {
  return libraries.map(library => readAppManifest(library, client.appId)).filter(Boolean);
}

function detectClientInFolder(installPath) {
  const { appId } = readSteamInf(installPath);
  const choices = Object.values(GAME_CLIENTS).map(c => `--client ${c.id}`).join(' or ');

  if (appId === null) {
    throw new Error(`Cannot tell which CS:GO client is in ${installPath}: its csgo/steam.inf has no appID. Pass ${choices}.`);
  }

  const client = Object.values(GAME_CLIENTS).find(c => c.appId === appId);
  if (!client) {
    const supported = Object.values(GAME_CLIENTS).map(c => `${c.id} = ${c.appId}`).join(', ');
    throw new Error(`${installPath} contains appID ${appId}, which is not a supported client (${supported}).`);
  }
  return client;
}

/**
 * Check that the folder really is the selected client and can be launched.
 *
 * @param {Object} args
 * @param {Object} args.client Entry of GAME_CLIENTS.
 * @param {string} args.installPath
 * @param {ReturnType<typeof readAppManifest>} [args.manifest]
 * @returns {{ problems: string[], warnings: string[] }}
 */
export function verifyClientInstall({ client, installPath, manifest }) {
  const problems = [];
  const warnings = [];
  const otherChoices = Object.values(GAME_CLIENTS).filter(c => c.id !== client.id);

  if (!fs.existsSync(path.join(installPath, 'csgo.exe'))) {
    problems.push(`csgo.exe not found in ${installPath}`);
  }

  let inf = null;
  try {
    inf = readSteamInf(installPath);
  } catch (err) {
    problems.push(err.message);
  }

  if (inf) {
    if (inf.appId === null) {
      warnings.push(`steam.inf in ${installPath} has no appID; cannot confirm it is ${client.label}`);
    } else if (inf.appId !== client.appId) {
      const suggestion = otherChoices.find(c => c.appId === inf.appId);
      problems.push(
        `You selected ${client.label}, but ${installPath} contains ${describeGameClient(inf.appId)}. ` +
        (suggestion
          ? `Select the "${suggestion.id}" client instead, or point the CS:GO folder at the ${client.label} install.`
          : `Point the CS:GO folder at the ${client.label} install.`)
      );
    }
  }

  if (client.betaKey && manifest && manifest.betaKey !== client.betaKey) {
    problems.push(
      `Steam beta branch for app ${client.appId} is "${manifest.betaKey ?? 'none'}", expected "${client.betaKey}". ` +
      `In Steam: Counter-Strike 2 -> Properties -> Betas -> ${client.betaKey}, and let it finish downloading.`
    );
  }

  return { problems, warnings };
}
