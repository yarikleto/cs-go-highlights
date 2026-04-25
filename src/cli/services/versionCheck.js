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
