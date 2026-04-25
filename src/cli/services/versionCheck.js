/**
 * @fileoverview Version compatibility utilities.
 *
 * Pure-logic module: parses steam.inf and demo headers, then asserts
 * the configured version matches what's actually installed and what the
 * demo files report. Used by `analyze-v2` and `record` commands.
 */

import fs from 'node:fs';
import path from 'node:path';

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
 * Parse <csgoPath>/csgo/steam.inf and return ClientVersion / ServerVersion as integers.
 * Throws Error if the file is missing or required keys are absent.
 *
 * @param {string} csgoPath Path to CS:GO install root (the folder that contains `csgo/`).
 * @returns {{ clientVersion: number, serverVersion: number }}
 */
export function readSteamInf(csgoPath) {
  const infPath = path.join(csgoPath, 'csgo', 'steam.inf');
  if (!fs.existsSync(infPath)) {
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

  return { clientVersion, serverVersion };
}

const DEMO_HEADER_SIZE = 1072;
const DEMO_MAGIC = 'HL2DEMO\0';

/**
 * Read the 1072-byte CS:GO demo header without parsing the full file.
 *
 * @param {string} filePath Absolute or relative path to a .dem file.
 * @returns {{ file: string, demoProtocol: number, networkProtocol: number, mapName: string }}
 */
export function readDemoHeader(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(DEMO_HEADER_SIZE);
    const bytesRead = fs.readSync(fd, buf, 0, DEMO_HEADER_SIZE, 0);
    if (bytesRead < DEMO_HEADER_SIZE) {
      throw new Error(`Demo file ${filePath} is too short to contain a header (${bytesRead} bytes)`);
    }

    const magic = buf.toString('binary', 0, 8);
    if (magic !== DEMO_MAGIC) {
      throw new Error(`File ${filePath} is not a CS:GO demo (bad magic ${JSON.stringify(magic)})`);
    }

    const demoProtocol = buf.readInt32LE(8);
    const networkProtocol = buf.readInt32LE(12);
    // Map name is a null-padded fixed-width string at offset 536.
    const mapEnd = buf.indexOf(0, 536);
    const mapName = buf.toString('utf8', 536, mapEnd >= 0 && mapEnd < 796 ? mapEnd : 796);

    return {
      file: path.basename(filePath),
      demoProtocol,
      networkProtocol,
      mapName,
    };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Verify the installed game and the demo batch agree with the expected version.
 * Collects ALL violations into one error so the user sees everything at once.
 *
 * @param {Object} args
 * @param {string} [args.csgoPath] Optional CS:GO install root. When provided,
 *   steam.inf is parsed and ClientVersion / ServerVersion are checked against
 *   `expected`. analyze-v2 omits this; record provides it.
 * @param {Array<{file: string, networkProtocol: number}>} args.demoHeaders
 *   Headers of all demos that will be processed in this run.
 * @param {{clientVersion: number, serverVersion: number, networkProtocol: number|null}} args.expected
 *   Expected version triple from `GAME_VERSION` in src/config.js (possibly
 *   overridden by CLI flags).
 * @throws {VersionMismatchError} if any check fails.
 */
export function assertVersionCompatibility({ csgoPath, demoHeaders, expected }) {
  const reasons = [];

  if (csgoPath) {
    const inf = readSteamInf(csgoPath);
    if (inf.clientVersion !== expected.clientVersion) {
      reasons.push(
        `steam.inf ClientVersion=${inf.clientVersion} does not match expected ${expected.clientVersion} ` +
        `(Steam may have auto-updated CS:GO — restore steam.inf or update config)`
      );
    }
    if (inf.serverVersion !== expected.serverVersion) {
      reasons.push(
        `steam.inf ServerVersion=${inf.serverVersion} does not match expected ${expected.serverVersion} ` +
        `(Steam may have auto-updated CS:GO — restore steam.inf or update config)`
      );
    }
  }

  if (expected.networkProtocol !== null && expected.networkProtocol !== undefined) {
    for (const h of demoHeaders) {
      if (h.networkProtocol !== expected.networkProtocol) {
        reasons.push(
          `Demo "${h.file}" has networkProtocol=${h.networkProtocol}, expected ${expected.networkProtocol}`
        );
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
}
