import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { extractCommand } from './extract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');

test('extractCommand extracts .dem.gz files from zip archives and skips macOS metadata', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'extract-zip-test-'));

  try {
    const archivePath = path.join(tmpDir, 'archive.zip');
    const outputPath = path.join(tmpDir, 'out');
    const demoContent = Buffer.from('demo payload');

    await createZip(archivePath, [
      {
        name: 'matches/demo.dem.gz',
        data: gzipSync(demoContent),
      },
      {
        name: '__MACOSX/._demo.dem.gz',
        data: Buffer.from('not a gzip demo'),
      },
    ]);

    await runQuietly(() => extractCommand({ archive: archivePath, output: outputPath }));

    assert.deepEqual(fs.readdirSync(outputPath), ['demo.dem']);
    assert.equal(fs.readFileSync(path.join(outputPath, 'demo.dem'), 'utf8'), 'demo payload');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('extractCommand accepts a direct .dem.gz input', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'extract-gz-test-'));

  try {
    const archivePath = path.join(tmpDir, 'direct.dem.gz');
    const outputPath = path.join(tmpDir, 'out');
    fs.writeFileSync(archivePath, gzipSync(Buffer.from('direct demo payload')));

    await runQuietly(() => extractCommand({ archive: archivePath, output: outputPath }));

    assert.deepEqual(fs.readdirSync(outputPath), ['direct.dem']);
    assert.equal(fs.readFileSync(path.join(outputPath, 'direct.dem'), 'utf8'), 'direct demo payload');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('extract CLI fails when an archive contains no demos', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'extract-empty-test-'));

  try {
    const archivePath = path.join(tmpDir, 'empty.zip');
    const outputPath = path.join(tmpDir, 'out');

    await createZip(archivePath, [
      {
        name: 'readme.txt',
        data: Buffer.from('no demos here'),
      },
    ]);

    const result = await runCli([
      'src/index.js',
      'extract',
      '--archive',
      archivePath,
      '--output',
      outputPath,
    ]);

    assert.equal(result.code, 1);
    assert.match(result.stderr, /No \.dem files found in the archive/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

async function runQuietly(fn) {
  const originalLog = console.log;
  const originalError = console.error;

  console.log = () => {};
  console.error = () => {};

  try {
    return await fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: REPO_ROOT,
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', code => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function createZip(zipPath, entries) {
  const sourceDir = `${zipPath}-contents`;
  fs.mkdirSync(sourceDir, { recursive: true });

  for (const entry of entries) {
    const filePath = path.join(sourceDir, entry.name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, entry.data);
  }

  await runZipCreate(zipPath, sourceDir);
}

async function runZipCreate(zipPath, sourceDir) {
  if (process.platform === 'win32') {
    try {
      await runProcess('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "$ErrorActionPreference = 'Stop'; Compress-Archive -LiteralPath (Get-ChildItem -Force $args[0]).FullName -DestinationPath $args[1] -Force",
        sourceDir,
        zipPath,
      ]);
      return;
    } catch {
      await runProcess('tar', ['-a', '-cf', zipPath, '-C', sourceDir, '.']);
      return;
    }
  }

  try {
    await runProcess('zip', ['-qr', zipPath, '.'], { cwd: sourceDir });
  } catch {
    await runProcess('bsdtar', ['-a', '-cf', zipPath, '-C', sourceDir, '.']);
  }
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let stderr = '';

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
      }
    });
  });
}
