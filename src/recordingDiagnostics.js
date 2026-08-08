import fs from 'node:fs';
import path from 'node:path';

const MAX_CAPTURED_OUTPUT_LENGTH = 16 * 1024;
const MAX_REPORTED_OUTPUT_LENGTH = 4 * 1024;

function appendOutputTail(currentOutput, chunk, maxLength = MAX_CAPTURED_OUTPUT_LENGTH) {
  const combined = `${currentOutput}${chunk.toString()}`;
  return combined.length > maxLength ? combined.slice(-maxLength) : combined;
}

function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs)) return 'unknown duration';
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function formatHlaeDiagnostics(result) {
  if (!result) {
    return [
      'HLAE process details are unavailable.',
      'Inspect the CS:GO console for playdemo, exec, or mirv_streams errors.',
    ].join('\n');
  }

  let status;
  if (result.timedOut) {
    status = 'timed out';
  } else if (result.signal) {
    status = `terminated by signal ${result.signal}`;
  } else {
    status = `exited with code ${result.code ?? 'unknown'}`;
  }

  const lines = [`HLAE process: ${status} after ${formatDuration(result.durationMs)}.`];
  const output = result.output?.trim();

  if (output) {
    const tail = output.slice(-MAX_REPORTED_OUTPUT_LENGTH);
    lines.push('HLAE output (tail):');
    lines.push(tail.split(/\r?\n/).map(line => `  ${line}`).join('\n'));
  } else {
    lines.push('HLAE produced no captured launcher output; inspect the in-game console.');
  }

  return lines.join('\n');
}

function describeEntries(entries) {
  if (entries.length === 0) return '(empty)';

  return entries
    .map(entry => `${entry.name}${entry.isDirectory() ? '/' : ''}`)
    .sort()
    .join(', ');
}

function createArtifactError(message, details) {
  const {
    expectedPath,
    observedLabel,
    observedEntries,
    launchResult,
    checks,
  } = details;

  const lines = [
    message,
    `Expected: ${expectedPath}`,
    `${observedLabel}: ${describeEntries(observedEntries)}`,
    formatHlaeDiagnostics(launchResult),
    'Check the CS:GO console for:',
    ...checks.map(check => `  - ${check}`),
  ];

  return new Error(lines.join('\n'));
}

function readDirectory(directory, launchResult) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    throw new Error([
      `Could not inspect recording output directory: ${directory}`,
      `Filesystem error: ${error.message}`,
      formatHlaeDiagnostics(launchResult),
    ].join('\n'));
  }
}

/**
 * Locate and validate the files produced by mirv_streams.
 */
function inspectRecordingArtifacts(inputFolder, launchResult) {
  const rootEntries = readDirectory(inputFolder, launchResult);
  const takeEntries = rootEntries
    .filter(entry => entry.isDirectory() && entry.name.startsWith('take'))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (takeEntries.length === 0) {
    throw createArtifactError(
      `No take folders found in ${inputFolder}. HLAE did not start a recording.`,
      {
        expectedPath: path.join(inputFolder, 'take0000'),
        observedLabel: 'Output folder contents',
        observedEntries: rootEntries,
        launchResult,
        checks: [
          'a line beginning with "=== Recording config loaded for" (the generated CFG ran)',
          '"=== Recording started ===" (the VDM reached the start tick)',
          'playdemo, exec, or mirv_streams errors',
          'CS:GO was fully closed before HLAE launched it',
        ],
      },
    );
  }

  const takeFolder = path.join(inputFolder, takeEntries[0].name);
  const takeContents = readDirectory(takeFolder, launchResult);
  const streamEntries = takeContents
    .filter(entry => entry.isDirectory())
    .sort((a, b) => {
      if (a.name === 'norm') return -1;
      if (b.name === 'norm') return 1;
      return a.name.localeCompare(b.name);
    });

  if (streamEntries.length === 0) {
    throw createArtifactError(
      `No stream folders found in ${takeFolder}. HLAE created a take but no video stream.`,
      {
        expectedPath: path.join(takeFolder, 'norm'),
        observedLabel: 'Take folder contents',
        observedEntries: takeContents,
        launchResult,
        checks: [
          'mirv_streams add normal norm completed without an error',
          'mirv_streams edit norm record 1 completed without an error',
          'the generated recording CFG loaded before recording started',
        ],
      },
    );
  }

  const streamFolder = path.join(takeFolder, streamEntries[0].name);
  const streamContents = readDirectory(streamFolder, launchResult);
  const tgaFiles = streamContents
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.tga'))
    .map(entry => entry.name)
    .sort();

  if (tgaFiles.length === 0) {
    throw createArtifactError(
      `No TGA frames found in ${streamFolder}. The stream exists but recorded no frames.`,
      {
        expectedPath: path.join(streamFolder, '00000.tga'),
        observedLabel: 'Stream folder contents',
        observedEntries: streamContents,
        launchResult,
        checks: [
          '"=== Recording started ===" and "=== Recording ended ===" appeared',
          'mirv_streams record start did not report an error',
          'the demo did not end or crash before the highlight ticks',
        ],
      },
    );
  }

  const audioPath = path.join(takeFolder, 'audio.wav');

  return {
    takeFolder,
    streamFolder,
    tgaFiles,
    audioFile: fs.existsSync(audioPath) ? audioPath : null,
  };
}

export {
  appendOutputTail,
  formatHlaeDiagnostics,
  inspectRecordingArtifacts,
};
