import nodeFs from 'node:fs';
import path from 'node:path';
import { HttpError } from './http.js';

const PERMISSION_ERROR_CODES = Object.freeze(['EACCES', 'EPERM']);
const DRIVE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function listDirectory(requestedPath, { projectRoot, fs = nodeFs }) {
  const directory = resolveListingDirectory(requestedPath, { projectRoot, fs });
  const parent = path.dirname(directory);

  return {
    path: directory,
    parent: parent === directory ? null : parent,
    separator: path.sep,
    entries: sortEntries(readEntries(directory, fs)),
  };
}

/** Picks the folder to show: a file shows its folder, a missing path shows its nearest existing ancestor. */
export function resolveListingDirectory(requestedPath, { projectRoot, fs = nodeFs }) {
  if (!requestedPath || requestedPath.trim() === '') return projectRoot;

  let candidate = path.resolve(projectRoot, requestedPath);
  while (true) {
    const stat = statOrNull(candidate, fs);
    if (stat) return stat.isDirectory() ? candidate : path.dirname(candidate);

    const parent = path.dirname(candidate);
    if (parent === candidate) return projectRoot;
    candidate = parent;
  }
}

export function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
}

export function listRoots({ platform = process.platform, fs = nodeFs } = {}) {
  if (platform !== 'win32') return [{ name: '/', path: '/' }];

  return [...DRIVE_LETTERS]
    .map(letter => ({ name: `${letter}:`, path: `${letter}:\\` }))
    .filter(drive => fs.existsSync(drive.path));
}

function readEntries(directory, fs) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true }).map(dirent => {
      const entryPath = path.join(directory, dirent.name);
      return { name: dirent.name, path: entryPath, isDirectory: isDirectoryEntry(dirent, entryPath, fs) };
    });
  } catch (error) {
    if (PERMISSION_ERROR_CODES.includes(error.code)) {
      throw new HttpError(403, `Permission denied: ${directory}`);
    }
    throw error;
  }
}

function isDirectoryEntry(dirent, entryPath, fs) {
  if (!dirent.isSymbolicLink()) return dirent.isDirectory();
  return statOrNull(entryPath, fs)?.isDirectory() ?? false;
}

function statOrNull(candidate, fs) {
  try {
    return fs.statSync(candidate);
  } catch {
    return null;
  }
}
