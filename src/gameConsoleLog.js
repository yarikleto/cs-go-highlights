/**
 * @fileoverview Capture the game client's console output for each HLAE run.
 *
 * The client is launched with `-condebug`, which makes the Source engine write
 * every console line (from engine start-up on) to <csgoPath>/csgo/console.log.
 * That file is shared between runs and may be appended to or truncated, so we
 * remember its size before launching and afterwards copy only the new part to
 * <output>/logs/<run>.console.log, next to the full HLAE output.
 */

import fs from 'node:fs';
import path from 'node:path';

/** Engine launch options that enable console logging. */
export const CONSOLE_LOG_LAUNCH_OPTIONS = '-condebug +con_timestamp 1';

const MAX_SAVED_LOG_BYTES = 64 * 1024 * 1024;
const TAIL_LINES = 15;
const MAX_PROBLEM_LINES = 20;

/**
 * Console lines that usually explain a failed recording. Deliberately broad:
 * a false positive costs one extra line in the error message.
 */
const PROBLEM_LINE_RE = /\b(error|fail(ed|ure)?|unknown command|couldn'?t|can'?t|cannot|not found|missing|invalid|bad |crash|disconnect|timed out|unable)\b/i;

export function getGameConsoleLogPath(csgoPath) {
  return path.join(csgoPath, 'csgo', 'console.log');
}

function fileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

/**
 * Remember where the shared console.log currently ends. Call right before
 * launching the game.
 *
 * @param {string} csgoPath Game install root.
 * @returns {{ sourcePath: string, offset: number, startedAt: Date }}
 */
export function startGameConsoleCapture(csgoPath) {
  const sourcePath = getGameConsoleLogPath(csgoPath);
  return { sourcePath, offset: fileSize(sourcePath), startedAt: new Date() };
}

/**
 * Read what the game wrote to console.log since `startGameConsoleCapture`.
 * If the file shrank (the engine truncated it on start), read it from the top.
 *
 * @param {{ sourcePath: string, offset: number }} capture
 * @returns {string|null} null when the game wrote no console.log at all.
 */
export function readCapturedConsole(capture) {
  if (!fs.existsSync(capture.sourcePath)) return null;

  const size = fileSize(capture.sourcePath);
  let start = size >= capture.offset ? capture.offset : 0;
  if (size - start > MAX_SAVED_LOG_BYTES) start = size - MAX_SAVED_LOG_BYTES;

  const length = size - start;
  if (length <= 0) return '';

  const fd = fs.openSync(capture.sourcePath, 'r');
  try {
    const buf = Buffer.alloc(length);
    const bytesRead = fs.readSync(fd, buf, 0, length, start);
    return buf.toString('utf8', 0, bytesRead);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Pick the lines that most likely explain a failure, plus the last lines.
 *
 * @param {string} text
 * @returns {{ problemLines: string[], tailLines: string[] }}
 */
export function summarizeConsole(text) {
  const lines = (text || '').split(/\r?\n/).map(l => l.trimEnd()).filter(Boolean);
  return {
    problemLines: lines.filter(l => PROBLEM_LINE_RE.test(l)).slice(-MAX_PROBLEM_LINES),
    tailLines: lines.slice(-TAIL_LINES),
  };
}

/**
 * Save the game console and HLAE output of one run into `logDir`. Never
 * throws: losing a log must not hide the real recording error.
 *
 * @param {Object} args
 * @param {{ sourcePath: string, offset: number, startedAt: Date }} args.capture
 * @param {string} args.logDir Folder to write logs into (created if missing).
 * @param {string} args.logName Base file name, e.g. "3-de_mirage-abc123".
 * @param {Object} args.details Launch details written as the log header.
 * @param {string} args.hlaeOutput Full HLAE stdout/stderr.
 * @returns {{
 *   consoleLogPath: string|null,
 *   hlaeLogPath: string|null,
 *   consoleCaptured: boolean,
 *   problemLines: string[],
 *   tailLines: string[],
 *   error: string|null,
 * }}
 */
export function saveRunLogs({ capture, logDir, logName, details, hlaeOutput }) {
  const result = {
    consoleLogPath: null,
    hlaeLogPath: null,
    consoleCaptured: false,
    problemLines: [],
    tailLines: [],
    error: null,
  };

  try {
    fs.mkdirSync(logDir, { recursive: true });

    const header = [
      `# Started:  ${capture.startedAt.toISOString()}`,
      `# Finished: ${new Date().toISOString()}`,
      ...Object.entries(details).map(([k, v]) => `# ${k}: ${v}`),
      '',
    ].join('\n');

    const consoleText = readCapturedConsole(capture);
    result.consoleCaptured = consoleText !== null;
    Object.assign(result, summarizeConsole(consoleText));

    result.consoleLogPath = path.join(logDir, `${logName}.console.log`);
    fs.writeFileSync(
      result.consoleLogPath,
      header + `# Source: ${capture.sourcePath}\n\n` +
        (consoleText ?? `(the game did not write ${capture.sourcePath}; it may not have started)\n`),
    );

    result.hlaeLogPath = path.join(logDir, `${logName}.hlae.log`);
    fs.writeFileSync(result.hlaeLogPath, header + '\n' + (hlaeOutput || '(no HLAE output)\n'));
  } catch (err) {
    result.error = err.message;
  }

  return result;
}
