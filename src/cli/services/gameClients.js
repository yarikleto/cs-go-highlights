/**
 * @fileoverview Game client selection for recording.
 *
 * Recording launches a real CS:GO client through HLAE, so the user decides
 * which one (see GAME_CLIENTS in src/config.js):
 *
 *   - legacy:     CS2 (app 730) with the `csgo_legacy` beta branch
 *   - standalone: Counter-Strike: Global Offensive (app 4465480)
 *
 * The install folder comes from `--csgo`, or is located through the Steam
 * library manifests (steamapps/appmanifest_<appId>.acf), so the user does not
 * need to know where Steam put each app. The folder is then verified to really
 * be the selected client before anything is launched.
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
 * Decide which folder to launch for the selected client.
 *
 * @param {Object} args
 * @param {Object} args.client Entry of GAME_CLIENTS.
 * @param {string} [args.csgoPath] Explicit folder from `--csgo` (wins if given).
 * @param {string} args.steamRoot Steam install folder used to find libraries.
 * @param {string} [args.fallbackPath] Folder to try when Steam has no manifest.
 * @returns {{ installPath: string, source: 'option'|'steam'|'fallback', manifest: ReturnType<typeof readAppManifest> }}
 */
export function resolveClientInstall({ client, csgoPath, steamRoot, fallbackPath }) {
  const libraries = findSteamLibraries(steamRoot);
  const manifests = libraries
    .map(lib => readAppManifest(lib, client.appId))
    .filter(Boolean);

  if (csgoPath) {
    const installPath = path.resolve(csgoPath);
    const manifest = manifests.find(m => samePath(m.installPath, installPath)) ?? null;
    return { installPath, source: 'option', manifest };
  }

  const installed = manifests.find(m => fs.existsSync(m.installPath));
  if (installed) {
    return { installPath: installed.installPath, source: 'steam', manifest: installed };
  }

  if (fallbackPath && fs.existsSync(fallbackPath)) {
    return { installPath: path.resolve(fallbackPath), source: 'fallback', manifest: null };
  }

  throw new Error(
    `Could not find ${client.label} in your Steam libraries (${libraries.join(', ')}). ` +
    'Install it in Steam, or set the CS:GO folder (--csgo) to its install folder.'
  );
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
