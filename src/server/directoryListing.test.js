import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listDirectory, listRoots, resolveListingDirectory, sortEntries } from './directoryListing.js';
import { HttpError } from './http.js';

function withTempDir(callback) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'listing-')));
  try {
    return callback(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('sortEntries puts folders first and sorts names naturally', () => {
  const entries = [
    { name: 'b10.mp4', isDirectory: false },
    { name: 'B2.mp4', isDirectory: false },
    { name: 'zeta', isDirectory: true },
    { name: 'Alpha', isDirectory: true },
  ];

  assert.deepEqual(sortEntries(entries).map(entry => entry.name), ['Alpha', 'zeta', 'B2.mp4', 'b10.mp4']);
});

test('listDirectory lists folders before files with absolute paths', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'a.mp4'), '');
    fs.mkdirSync(path.join(dir, 'sub'));

    const listing = listDirectory(dir, { projectRoot: dir });

    assert.equal(listing.path, dir);
    assert.equal(listing.parent, path.dirname(dir));
    assert.equal(listing.separator, path.sep);
    assert.deepEqual(listing.entries, [
      { name: 'sub', path: path.join(dir, 'sub'), isDirectory: true },
      { name: 'a.mp4', path: path.join(dir, 'a.mp4'), isDirectory: false },
    ]);
  });
});

test('listDirectory reports a null parent at the filesystem root', () => {
  const root = path.parse(process.cwd()).root;
  assert.equal(listDirectory(root, { projectRoot: root }).parent, null);
});

test('resolveListingDirectory uses the project root for an empty path', () => {
  withTempDir((dir) => {
    assert.equal(resolveListingDirectory('', { projectRoot: dir }), dir);
    assert.equal(resolveListingDirectory(undefined, { projectRoot: dir }), dir);
  });
});

test('resolveListingDirectory falls back to the nearest existing ancestor', () => {
  withTempDir((dir) => {
    fs.mkdirSync(path.join(dir, 'a'));
    assert.equal(resolveListingDirectory(path.join(dir, 'a', 'missing', 'deeper'), { projectRoot: dir }), path.join(dir, 'a'));
  });
});

test('resolveListingDirectory uses the parent of a file path', () => {
  withTempDir((dir) => {
    const filePath = path.join(dir, 'demo.dem');
    fs.writeFileSync(filePath, '');
    assert.equal(resolveListingDirectory(filePath, { projectRoot: dir }), dir);
  });
});

test('resolveListingDirectory resolves relative paths against the project root', () => {
  withTempDir((dir) => {
    fs.mkdirSync(path.join(dir, 'temp'));
    assert.equal(resolveListingDirectory('./temp', { projectRoot: dir }), path.join(dir, 'temp'));
  });
});

test('listDirectory reports permission errors as 403', () => {
  withTempDir((dir) => {
    const deniedFs = {
      ...fs,
      readdirSync: () => { throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }); },
    };

    assert.throws(
      () => listDirectory(dir, { projectRoot: dir, fs: deniedFs }),
      (error) => error instanceof HttpError && error.status === 403 && error.message === `Permission denied: ${dir}`,
    );
  });
});

test('listRoots returns existing drive letters on win32', () => {
  const existing = new Set(['C:\\', 'D:\\']);
  const roots = listRoots({ platform: 'win32', fs: { existsSync: drive => existing.has(drive) } });
  assert.deepEqual(roots, [{ name: 'C:', path: 'C:\\' }, { name: 'D:', path: 'D:\\' }]);
});

test('listRoots returns slash elsewhere', () => {
  assert.deepEqual(listRoots({ platform: 'linux' }), [{ name: '/', path: '/' }]);
});
