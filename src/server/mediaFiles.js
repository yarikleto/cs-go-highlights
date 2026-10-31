import fs from 'node:fs';
import path from 'node:path';
import { resolveProjectPath } from './paths.js';

const MIME_TYPES = Object.freeze({
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
});

export const VIDEO_EXTENSIONS = Object.freeze(['.mp4', '.avi', '.mkv', '.mov', '.webm']);
export const AUDIO_EXTENSIONS = Object.freeze(['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac']);
export const MEDIA_EXTENSIONS = Object.freeze([...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS]);

export function getMimeType(filePath) {
  return MIME_TYPES[extensionOf(filePath)] || 'application/octet-stream';
}

export function assertExistingFile(filePath, { extensions } = {}) {
  const resolvedPath = resolveProjectPath(filePath);

  if (extensions && !extensions.includes(extensionOf(resolvedPath))) {
    throw new Error(`Unsupported file type: ${path.extname(resolvedPath) || '(none)'}`);
  }

  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile()) {
    throw new Error(`Not a file: ${resolvedPath}`);
  }

  return { resolvedPath, size: stat.size };
}

export async function scanClips(folderPath, { probeDuration }) {
  const resolvedPath = resolveProjectPath(folderPath, 'folder');
  if (!fs.statSync(resolvedPath).isDirectory()) {
    throw new Error(`Not a folder: ${resolvedPath}`);
  }

  const clipNames = fs.readdirSync(resolvedPath)
    .filter(name => VIDEO_EXTENSIONS.includes(extensionOf(name)))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  return describeMediaFiles(clipNames.map(name => path.join(resolvedPath, name)), { probeDuration });
}

export function describeAudioFiles(filePaths, { probeDuration }) {
  return describeMediaFiles(filePaths, { probeDuration });
}

export function readTextFile(filePath) {
  const { resolvedPath } = assertExistingFile(filePath);
  return fs.readFileSync(resolvedPath, 'utf8');
}

export function readJsonFile(filePath) {
  return JSON.parse(readTextFile(filePath));
}

export function writeJsonFile(outputPath, data) {
  const resolvedPath = resolveProjectPath(outputPath, 'outputPath');
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, JSON.stringify(data, null, 2));
  return resolvedPath;
}

async function describeMediaFiles(filePaths, { probeDuration }) {
  const files = [];
  for (const filePath of filePaths) {
    files.push({ filename: path.basename(filePath), path: filePath, duration: await probeOrZero(filePath, probeDuration) });
  }
  return files;
}

async function probeOrZero(filePath, probeDuration) {
  try {
    return await probeDuration(filePath);
  } catch (error) {
    console.warn(`Failed to get duration for ${filePath}: ${error.message}`);
    return 0;
  }
}

function extensionOf(filePath) {
  return path.extname(filePath).toLowerCase();
}
