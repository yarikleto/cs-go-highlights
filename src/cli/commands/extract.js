/**
 * @fileoverview Extract command - recursively unpack archives to get demo files
 * 
 * Supports .zip and .rar archives with arbitrary nesting depth.
 * Also handles .gz compressed files (e.g. demo.dem.gz).
 * Produces a flat output directory containing only .dem files.
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn } from 'child_process';
import { createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import yauzl from 'yauzl';

const DEMO_EXTENSION = '.dem';
const GZIPPED_DEMO_SUFFIX = '.dem.gz';
const SUPPORTED_ARCHIVES = new Set(['.zip', '.rar']);
const JUNK_DIRS = new Set(['__macosx', '.ds_store', 'thumbs.db']);

/**
 * Main extract command handler
 * 
 * @param {Object} options - Command options from commander
 * @param {string} options.archive - Path to input archive
 * @param {string} options.output - Output folder for .dem files
 */
async function extractCommand(options) {
  const archivePath = path.resolve(options.archive);
  const outputPath = path.resolve(options.output);

  if (!fs.existsSync(archivePath)) {
    console.error(`Error: Archive not found: ${archivePath}`);
    process.exit(1);
  }

  const ext = path.extname(archivePath).toLowerCase();

  // Handle .dem files directly - just copy to output
  if (ext === DEMO_EXTENSION) {
    console.log(`Demo file: ${archivePath}`);
    console.log(`Output:    ${outputPath}`);
    fs.mkdirSync(outputPath, { recursive: true });
    const destPath = path.join(outputPath, path.basename(archivePath));
    fs.copyFileSync(archivePath, destPath);
    console.log(`\nDone! Copied ${path.basename(archivePath)} to ${outputPath}`);
    return;
  }

  // Handle .dem.gz files directly - decompress into output
  if (isGzippedDemo(archivePath)) {
    console.log(`Compressed demo: ${archivePath}`);
    console.log(`Output:          ${outputPath}`);
    fs.mkdirSync(outputPath, { recursive: true });
    const destPath = await decompressGz(archivePath, outputPath);
    console.log(`\nDone! Decompressed ${path.basename(destPath)} to ${outputPath}`);
    return;
  }

  if (!SUPPORTED_ARCHIVES.has(ext)) {
    console.error(`Error: Unsupported format "${ext}". Supported: .dem, .dem.gz, ${[...SUPPORTED_ARCHIVES].join(', ')}`);
    process.exit(1);
  }

  console.log(`Archive: ${archivePath}`);
  console.log(`Output:  ${outputPath}`);

  fs.mkdirSync(outputPath, { recursive: true });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csgo-extract-'));

  try {
    const demoFiles = [];
    await extractRecursive(archivePath, tempDir, demoFiles, 0);

    if (demoFiles.length === 0) {
      console.error('\nError: No .dem files found in the archive.');
      process.exit(1);
    }

    console.log(`\nFound ${demoFiles.length} demo file(s). Copying to output...`);

    const usedNames = new Set();
    let copied = 0;

    for (const demoFile of demoFiles) {
      const destName = getUniqueName(path.basename(demoFile), usedNames);
      const destPath = path.join(outputPath, destName);

      fs.copyFileSync(demoFile, destPath);
      usedNames.add(destName.toLowerCase());
      copied++;
      console.log(`  ${destName}`);
    }

    console.log(`\nDone! ${copied} demo file(s) extracted to ${outputPath}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/**
 * Generate a unique filename by appending _N suffix on collision
 */
function getUniqueName(baseName, usedNames) {
  if (!usedNames.has(baseName.toLowerCase())) return baseName;

  const ext = path.extname(baseName);
  const name = path.basename(baseName, ext);
  let counter = 2;

  while (usedNames.has(`${name}_${counter}${ext}`.toLowerCase())) {
    counter++;
  }

  return `${name}_${counter}${ext}`;
}

function isGzippedDemo(filePath) {
  return path.basename(filePath).toLowerCase().endsWith(GZIPPED_DEMO_SUFFIX);
}

function isJunkEntryName(name) {
  const parts = name.split(/[\\/]+/).filter(Boolean);
  return parts.some(part => {
    const lower = part.toLowerCase();
    return JUNK_DIRS.has(lower) || lower.startsWith('._');
  });
}

function getSafeExtractPath(baseDir, entryName) {
  const normalized = path.normalize(entryName);
  const destPath = path.resolve(baseDir, normalized);
  const basePath = path.resolve(baseDir);

  if (destPath !== basePath && !destPath.startsWith(basePath + path.sep)) {
    throw new Error(`Unsafe archive entry path: ${entryName}`);
  }

  return destPath;
}

/**
 * Extract an archive and recursively process its contents
 * 
 * @param {string} archivePath - Path to archive file
 * @param {string} extractTo - Temporary directory to extract into
 * @param {string[]} demoFiles - Accumulator for found .dem file paths
 * @param {number} depth - Current recursion depth (for logging indentation)
 */
async function extractRecursive(archivePath, extractTo, demoFiles, depth) {
  const indent = '  '.repeat(depth);
  const ext = path.extname(archivePath).toLowerCase();
  const name = path.basename(archivePath);

  console.log(`${indent}Extracting: ${name}`);

  try {
    if (ext === '.zip') {
      await extractZip(archivePath, extractTo);
    } else if (ext === '.rar') {
      await extractRar(archivePath, extractTo);
    } else {
      console.warn(`${indent}  Skipping unsupported format: ${ext}`);
      return;
    }
  } catch (err) {
    console.error(`${indent}  Failed to extract ${name}: ${err.message}`);
    return;
  }

  await scanDirectory(extractTo, demoFiles, depth);
}

/**
 * Extract a .zip archive after validating entry paths.
 */
async function extractZip(archivePath, extractTo) {
  await validateZipEntries(archivePath, extractTo);

  try {
    await extractZipWithSystemTool(archivePath, extractTo);
  } catch (systemError) {
    console.warn(`  System ZIP extractor failed: ${systemError.message}`);
    console.warn('  Falling back to yauzl ZIP extractor...');
    await extractZipWithYauzl(archivePath, extractTo);
  }
}

function validateZipEntries(archivePath, extractTo) {
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);

      zipfile.on('entry', (entry) => {
        try {
          getSafeExtractPath(extractTo, entry.fileName);
        } catch (error) {
          zipfile.close();
          reject(error);
          return;
        }

        zipfile.readEntry();
      });
      zipfile.on('end', resolve);
      zipfile.on('error', reject);
      zipfile.readEntry();
    });
  });
}

async function extractZipWithSystemTool(archivePath, extractTo) {
  const commands = getZipExtractorCommands(archivePath, extractTo);
  const errors = [];

  for (const { command, args } of commands) {
    try {
      await runProcess(command, args);
      return;
    } catch (error) {
      errors.push(`${command}: ${error.message}`);
    }
  }

  throw new Error(errors.join('; '));
}

function getZipExtractorCommands(archivePath, extractTo) {
  if (process.platform === 'win32') {
    return [
      {
        command: 'powershell.exe',
        args: [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          "$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force",
          archivePath,
          extractTo,
        ],
      },
      { command: 'tar', args: ['-xf', archivePath, '-C', extractTo] },
    ];
  }

  return [
    { command: 'unzip', args: ['-qq', '-o', archivePath, '-d', extractTo] },
    { command: 'bsdtar', args: ['-xf', archivePath, '-C', extractTo] },
    { command: 'tar', args: ['-xf', archivePath, '-C', extractTo] },
  ];
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        const message = stderr.trim() || `exit code ${code}`;
        reject(new Error(message));
      }
    });
  });
}

/**
 * Extract a .zip archive using yauzl.
 */
function extractZipWithYauzl(archivePath, extractTo) {
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);

      let settled = false;

      const fail = (error) => {
        if (settled) return;
        settled = true;
        zipfile.close();
        reject(error);
      };

      zipfile.on('entry', (entry) => {
        if (entry.fileName.endsWith('/') || isJunkEntryName(entry.fileName)) {
          zipfile.readEntry();
          return;
        }

        let destPath;
        try {
          destPath = getSafeExtractPath(extractTo, entry.fileName);
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
        } catch (error) {
          fail(error);
          return;
        }

        zipfile.openReadStream(entry, (err, readStream) => {
          if (err) return fail(err);
          const writeStream = fs.createWriteStream(destPath);
          readStream.on('error', fail);
          writeStream.on('error', fail);
          readStream.pipe(writeStream);
          writeStream.on('close', () => {
            if (!settled) zipfile.readEntry();
          });
        });
      });
      zipfile.on('end', () => {
        if (settled) return;
        settled = true;
        resolve();
      });
      zipfile.on('error', fail);
      zipfile.readEntry();
    });
  });
}

/**
 * Extract a .rar archive using node-unrar-js
 */
async function extractRar(archivePath, extractTo) {
  let createExtractorFromFile;
  try {
    ({ createExtractorFromFile } = await import('node-unrar-js'));
  } catch {
    throw new Error(
      'RAR support requires "node-unrar-js" package. Install it with: npm install node-unrar-js'
    );
  }

  const extractor = await createExtractorFromFile({
    filepath: archivePath,
    targetPath: extractTo,
  });

  const { files } = extractor.extract();
  // Consume the generator to trigger actual extraction
  for (const _ of files) { /* extracted */ }
}

/**
 * Decompress a .gz file, returning path to decompressed output
 */
async function decompressGz(gzPath, outputDir) {
  const baseName = path.basename(gzPath, '.gz');
  const outPath = path.join(outputDir, baseName);

  await pipeline(
    fs.createReadStream(gzPath),
    createGunzip(),
    fs.createWriteStream(outPath),
  );

  return outPath;
}

/**
 * Recursively scan a directory for .dem files, .gz compressed demos, and nested archives
 */
async function scanDirectory(dirPath, demoFiles, depth) {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  const indent = '  '.repeat(depth);

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (isJunkEntryName(entry.name)) continue;

    if (entry.isDirectory()) {
      await scanDirectory(fullPath, demoFiles, depth);
      continue;
    }

    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();

    if (ext === DEMO_EXTENSION) {
      demoFiles.push(fullPath);
    } else if (ext === '.gz' && isGzippedDemo(entry.name)) {
      console.log(`${indent}  Decompressing: ${entry.name}`);
      try {
        const decompressed = await decompressGz(fullPath, dirPath);
        demoFiles.push(decompressed);
      } catch (err) {
        console.error(`${indent}  Failed to decompress ${entry.name}: ${err.message}`);
      }
    } else if (SUPPORTED_ARCHIVES.has(ext)) {
      const nestedDir = fullPath + '_contents';
      fs.mkdirSync(nestedDir, { recursive: true });
      await extractRecursive(fullPath, nestedDir, demoFiles, depth + 1);
    }
  }
}

export { extractCommand };
