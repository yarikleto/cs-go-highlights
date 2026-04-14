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
import { createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import yauzl from 'yauzl';

const DEMO_EXTENSION = '.dem';
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

  // Handle .dem files directly — just copy to output
  if (ext === DEMO_EXTENSION) {
    console.log(`Demo file: ${archivePath}`);
    console.log(`Output:    ${outputPath}`);
    fs.mkdirSync(outputPath, { recursive: true });
    const destPath = path.join(outputPath, path.basename(archivePath));
    fs.copyFileSync(archivePath, destPath);
    console.log(`\nDone! Copied ${path.basename(archivePath)} to ${outputPath}`);
    return;
  }

  if (!SUPPORTED_ARCHIVES.has(ext)) {
    console.error(`Error: Unsupported format "${ext}". Supported: .dem, ${[...SUPPORTED_ARCHIVES].join(', ')}`);
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
      console.log('\nNo .dem files found in the archive.');
      return;
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
 * Extract a .zip archive using yauzl (supports files > 2 GiB)
 */
function extractZip(archivePath, extractTo) {
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);

      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        // Skip directories
        if (entry.fileName.endsWith('/')) {
          zipfile.readEntry();
          return;
        }

        const destPath = path.join(extractTo, entry.fileName);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });

        zipfile.openReadStream(entry, (err, readStream) => {
          if (err) return reject(err);
          const writeStream = fs.createWriteStream(destPath);
          readStream.pipe(writeStream);
          writeStream.on('close', () => zipfile.readEntry());
          writeStream.on('error', reject);
        });
      });
      zipfile.on('end', resolve);
      zipfile.on('error', reject);
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

    if (entry.isDirectory()) {
      if (JUNK_DIRS.has(entry.name.toLowerCase())) continue;
      await scanDirectory(fullPath, demoFiles, depth);
      continue;
    }

    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();

    if (ext === DEMO_EXTENSION) {
      demoFiles.push(fullPath);
    } else if (ext === '.gz' && entry.name.toLowerCase().endsWith('.dem.gz')) {
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
