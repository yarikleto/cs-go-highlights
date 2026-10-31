/**
 * @fileoverview Version compatibility utilities.
 *
 * Pure-logic module: reads the installed game client's steam.inf and the
 * headers of the demo files, then asserts that every demo can be played back
 * by that client. Works for any CS:GO build, e.g.:
 *
 *   - CS2 (app 730) with the `csgo_legacy` beta branch selected
 *   - Standalone CS:GO (app 4465480)
 *
 * The Source engine stamps every demo with the network protocol of the build
 * that recorded it, and that number is the client's steam.inf `PatchVersion`
 * with the dots removed (PatchVersion=1.38.8.1 -> networkProtocol=13881).
 * A demo only plays back reliably on a client with the same protocol, so that
 * is the primary check. Optional pins (ClientVersion / ServerVersion /
 * networkProtocol) can still be passed to guard against Steam auto-updates.
 *
 * Used by `analyze-v2` (demos only) and `record` (demos + installed client).
 */

import fs from 'node:fs';
import path from 'node:path';
import { GAME_CLIENTS } from '../../config.js';

export class VersionMismatchError extends Error {
  constructor(reasons) {
    if (!Array.isArray(reasons) || reasons.length === 0) {
      throw new Error('VersionMismatchError requires at least one reason');
    }
    super(`Game version compatibility check failed:\n  • ${reasons.join('\n  • ')}`);
    this.name = 'VersionMismatchError';
    this.reasons = reasons;
  }
}

/**
 * Convert a steam.inf PatchVersion ("1.38.8.1") into the network protocol
 * integer the engine writes into demo headers (13881).
 *
 * @param {string|null|undefined} patchVersion
 * @returns {number|null} null when the value is missing or malformed.
 */
export function patchVersionToProtocol(patchVersion) {
  if (typeof patchVersion !== 'string') return null;
  const trimmed = patchVersion.trim();
  if (!/^\d+(\.\d+)+$/.test(trimmed)) return null;
  return Number.parseInt(trimmed.replace(/\./g, ''), 10);
}

/**
 * Human-readable name of a client by Steam app ID.
 *
 * @param {number|null} appId
 * @returns {string}
 */
export function describeGameClient(appId) {
  if (appId === null || appId === undefined) return 'Unknown CS:GO client (no appID in steam.inf)';
  return Object.values(GAME_CLIENTS).find(c => c.appId === appId)?.label
    ?? `Unknown CS:GO client (appID ${appId})`;
}

/**
 * Parse <csgoPath>/csgo/steam.inf.
 * Throws Error if the file is missing or required keys are absent.
 *
 * @param {string} csgoPath Path to CS:GO install root (the folder that contains `csgo/` and `csgo.exe`).
 * @returns {{
 *   clientVersion: number,
 *   serverVersion: number,
 *   patchVersion: string|null,
 *   networkProtocol: number|null,
 *   appId: number|null,
 * }}
 */
export function readSteamInf(csgoPath) {
  const infPath = path.join(csgoPath, 'csgo', 'steam.inf');
  if (!fs.existsSync(infPath)) {
    // CS2 (Source 2) keeps its steam.inf under game/csgo/. Seeing that means the
    // folder holds CS2 itself, not the legacy CS:GO build HLAE can record with.
    const cs2InfPath = path.join(csgoPath, 'game', 'csgo', 'steam.inf');
    if (fs.existsSync(cs2InfPath)) {
      throw new Error(
        `steam.inf not found at ${infPath}, but ${cs2InfPath} exists: this folder contains CS2, not CS:GO. ` +
        'Either select the "csgo_legacy" beta for Counter-Strike 2 in Steam (Properties -> Betas), ' +
        'or install the standalone Counter-Strike: Global Offensive app (Steam app 4465480) and point the CS:GO folder at it.'
      );
    }
    throw new Error(`steam.inf not found at ${infPath}`);
  }

  const text = fs.readFileSync(infPath, 'utf8');
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    values[key] = val;
  }

  if (!('ClientVersion' in values)) {
    throw new Error(`steam.inf at ${infPath} is missing ClientVersion`);
  }
  if (!('ServerVersion' in values)) {
    throw new Error(`steam.inf at ${infPath} is missing ServerVersion`);
  }

  const clientVersion = Number.parseInt(values.ClientVersion, 10);
  const serverVersion = Number.parseInt(values.ServerVersion, 10);
  if (Number.isNaN(clientVersion)) {
    throw new Error(`steam.inf ClientVersion is not an integer: ${values.ClientVersion}`);
  }
  if (Number.isNaN(serverVersion)) {
    throw new Error(`steam.inf ServerVersion is not an integer: ${values.ServerVersion}`);
  }

  // steam.inf spells the key `appID`; match case-insensitively to be safe.
  const appIdKey = Object.keys(values).find(k => k.toLowerCase() === 'appid');
  const appIdParsed = appIdKey ? Number.parseInt(values[appIdKey], 10) : Number.NaN;

  const patchVersion = values.PatchVersion ?? null;

  return {
    clientVersion,
    serverVersion,
    patchVersion,
    networkProtocol: patchVersionToProtocol(patchVersion),
    appId: Number.isNaN(appIdParsed) ? null : appIdParsed,
  };
}

const DEMO_HEADER_SIZE = 1072;
const DEMO_MAGIC = 'HL2DEMO\0';
const CS2_DEMO_MAGIC = 'PBDEMS2\0';
const HEADER_STRING_LENGTH = 260;

function readFixedString(buf, offset) {
  const end = buf.indexOf(0, offset);
  const limit = offset + HEADER_STRING_LENGTH;
  return buf.toString('utf8', offset, end >= 0 && end < limit ? end : limit);
}

/**
 * Read the 1072-byte CS:GO demo header without parsing the full file.
 *
 * @param {string} filePath Absolute or relative path to a .dem file.
 * @returns {{
 *   file: string,
 *   demoProtocol: number,
 *   networkProtocol: number,
 *   serverName: string,
 *   clientName: string,
 *   mapName: string,
 *   gameDirectory: string,
 * }}
 */
export function readDemoHeader(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(DEMO_HEADER_SIZE);
    const bytesRead = fs.readSync(fd, buf, 0, DEMO_HEADER_SIZE, 0);

    const magic = buf.toString('binary', 0, 8);
    if (magic === CS2_DEMO_MAGIC) {
      throw new Error(
        `Demo ${path.basename(filePath)} was recorded in CS2 (Source 2). ` +
        'Only CS:GO demos are supported (CS2 csgo_legacy beta or standalone CS:GO app 4465480).'
      );
    }
    if (bytesRead < DEMO_HEADER_SIZE) {
      throw new Error(`Demo file ${filePath} is too short to contain a header (${bytesRead} bytes)`);
    }
    if (magic !== DEMO_MAGIC) {
      throw new Error(`File ${filePath} is not a CS:GO demo (bad magic ${JSON.stringify(magic)})`);
    }

    return {
      file: path.basename(filePath),
      demoProtocol: buf.readInt32LE(8),
      networkProtocol: buf.readInt32LE(12),
      serverName: readFixedString(buf, 16),
      clientName: readFixedString(buf, 276),
      mapName: readFixedString(buf, 536),
      gameDirectory: readFixedString(buf, 796),
    };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Verify the demo batch can be played back by the installed game client.
 * Collects ALL violations into one error so the user sees everything at once.
 *
 * Demo protocol is checked against, in order of precedence:
 *   1. `expected.networkProtocol` (explicit pin / override), else
 *   2. the installed client's protocol derived from steam.inf PatchVersion, else
 *   3. (no csgoPath) demos must merely agree with each other.
 *
 * @param {Object} args
 * @param {string} [args.csgoPath] Optional CS:GO install root. When provided,
 *   steam.inf is parsed and every demo must match the installed client.
 *   analyze-v2 omits this; record provides it.
 * @param {Array<{file: string, networkProtocol: number, gameDirectory?: string}>} args.demoHeaders
 *   Headers of all demos that will be processed in this run.
 * @param {{clientVersion: number|null, serverVersion: number|null, networkProtocol: number|null}} args.expected
 *   Optional pins. `null` means "don't pin, follow the installed client".
 * @returns {{ client: ReturnType<typeof readSteamInf>|null, clientName: string|null, protocol: number|null }}
 *   What the demos were checked against (useful for logging).
 * @throws {VersionMismatchError} if any check fails.
 */
export function assertVersionCompatibility({ csgoPath, demoHeaders, expected }) {
  const reasons = [];
  const hasPin = (v) => v !== null && v !== undefined && !Number.isNaN(v);

  let client = null;
  let clientName = null;
  if (csgoPath) {
    client = readSteamInf(csgoPath);
    clientName = describeGameClient(client.appId);

    if (hasPin(expected.clientVersion) && client.clientVersion !== expected.clientVersion) {
      reasons.push(
        `steam.inf ClientVersion=${client.clientVersion} does not match expected ${expected.clientVersion} ` +
        `(Steam may have auto-updated ${clientName} — restore steam.inf or update the pinned version)`
      );
    }
    if (hasPin(expected.serverVersion) && client.serverVersion !== expected.serverVersion) {
      reasons.push(
        `steam.inf ServerVersion=${client.serverVersion} does not match expected ${expected.serverVersion} ` +
        `(Steam may have auto-updated ${clientName} — restore steam.inf or update the pinned version)`
      );
    }
  }

  for (const h of demoHeaders) {
    if (h.gameDirectory && h.gameDirectory.toLowerCase() !== 'csgo') {
      reasons.push(`Demo "${h.file}" was recorded for game "${h.gameDirectory}", not CS:GO`);
    }
  }

  let protocol = null;
  if (hasPin(expected.networkProtocol)) {
    protocol = expected.networkProtocol;
    for (const h of demoHeaders) {
      if (h.networkProtocol !== protocol) {
        reasons.push(`Demo "${h.file}" has networkProtocol=${h.networkProtocol}, expected ${protocol}`);
      }
    }
  } else if (client) {
    protocol = client.networkProtocol;
    if (protocol === null) {
      reasons.push(
        `Cannot determine the network protocol of ${clientName}: steam.inf has no valid PatchVersion ` +
        `(got ${JSON.stringify(client.patchVersion)}). Pass --network-protocol to set it explicitly.`
      );
    } else {
      for (const h of demoHeaders) {
        if (h.networkProtocol !== protocol) {
          reasons.push(
            `Demo "${h.file}" has networkProtocol=${h.networkProtocol}, but the installed client ` +
            `(${clientName}, PatchVersion ${client.patchVersion}) expected ${protocol}. ` +
            (h.networkProtocol > protocol
              ? 'The demo is newer than the game — update the game or use a client of that build.'
              : 'The demo is older than the game — use a client of the build the demo was recorded on.')
          );
        }
      }
    }
  } else if (demoHeaders.length > 1) {
    const first = demoHeaders[0].networkProtocol;
    const mixed = demoHeaders.some(h => h.networkProtocol !== first);
    if (mixed) {
      const summary = demoHeaders.map(h => `${h.file}=${h.networkProtocol}`).join(', ');
      reasons.push(`Demos use mixed networkProtocol: ${summary}`);
    }
  }

  if (reasons.length > 0) {
    throw new VersionMismatchError(reasons);
  }

  return { client, clientName, protocol };
}

/**
 * Build the expected version pins from CLI options, falling back to GAME_VERSION
 * defaults. Commander coerces `--client-version` / `--server-version` /
 * `--network-protocol` to numbers; missing flags arrive as `undefined`.
 *
 * @param {Object} options Commander options object.
 * @param {{clientVersion: number|null, serverVersion: number|null, networkProtocol: number|null}} defaults
 *   Usually `GAME_VERSION` from `src/config.js`. Passed in (rather than imported)
 *   so this function stays a pure-logic helper, easy to test.
 * @returns {{clientVersion: number|null, serverVersion: number|null, networkProtocol: number|null}}
 */
export function resolveExpectedVersion(options, defaults) {
  const pick = (raw, fallback) => (raw === undefined || Number.isNaN(raw)) ? fallback : raw;
  return {
    clientVersion: pick(options.clientVersion, defaults.clientVersion),
    serverVersion: pick(options.serverVersion, defaults.serverVersion),
    networkProtocol: pick(options.networkProtocol, defaults.networkProtocol),
  };
}
