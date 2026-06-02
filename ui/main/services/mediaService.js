const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { assertNonEmptyString, resolveProjectPath } = require('./paths');

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

const VIDEO_EXTENSIONS = Object.freeze(['.mp4', '.avi', '.mkv', '.mov', '.webm']);
const AUDIO_EXTENSIONS = Object.freeze(['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac']);
const MEDIA_EXTENSIONS = Object.freeze([...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS]);

function getExtension(filePath) {
  return path.extname(filePath).toLowerCase();
}

function getMimeType(filePath) {
  return MIME_TYPES[getExtension(filePath)] || 'application/octet-stream';
}

function isAllowedExtension(filePath, extensions) {
  return extensions.includes(getExtension(filePath));
}

function assertExistingFile(filePath, extensions = null) {
  const resolvedPath = resolveProjectPath(filePath);

  if (extensions && !isAllowedExtension(resolvedPath, extensions)) {
    throw new Error(`Unsupported file type: ${path.extname(resolvedPath) || '(none)'}`);
  }

  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile()) {
    throw new Error(`Not a file: ${resolvedPath}`);
  }

  return { resolvedPath, stat };
}

function getMediaDuration(filePath) {
  const { resolvedPath } = assertExistingFile(filePath, MEDIA_EXTENSIONS);

  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'json',
      resolvedPath,
    ];

    const ffprobe = spawn('ffprobe', args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    ffprobe.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ffprobe.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        const duration = parseFloat(result.format?.duration || 0);
        resolve(duration);
      } catch (e) {
        reject(new Error(`Failed to parse ffprobe output: ${e.message}`));
      }
    });

    ffprobe.on('error', (err) => {
      reject(new Error(`Failed to run ffprobe: ${err.message}`));
    });
  });
}

async function scanClips(folderPath) {
  const resolvedPath = resolveProjectPath(folderPath, 'folderPath');
  const stat = fs.statSync(resolvedPath);

  if (!stat.isDirectory()) {
    throw new Error(`Not a folder: ${resolvedPath}`);
  }

  const files = fs.readdirSync(resolvedPath);
  const clips = [];

  for (const file of files) {
    if (!isAllowedExtension(file, VIDEO_EXTENSIONS)) {
      continue;
    }

    const filePath = path.join(resolvedPath, file);
    try {
      const duration = await getMediaDuration(filePath);
      clips.push({
        filename: file,
        path: filePath,
        duration,
      });
    } catch (e) {
      console.warn(`Failed to get duration for ${file}:`, e.message);
      clips.push({
        filename: file,
        path: filePath,
        duration: 0,
      });
    }
  }

  clips.sort((a, b) => (
    a.filename.localeCompare(b.filename, undefined, { numeric: true, sensitivity: 'base' })
  ));

  return clips;
}

function readMediaFileBuffer(filePath) {
  const { resolvedPath } = assertExistingFile(filePath, MEDIA_EXTENSIONS);
  return fs.readFileSync(resolvedPath);
}

function readTextFile(filePath) {
  const { resolvedPath } = assertExistingFile(filePath);
  return fs.readFileSync(resolvedPath, 'utf8');
}

function readJsonFile(filePath) {
  return JSON.parse(readTextFile(filePath));
}

function writeJsonFile(outputPath, data) {
  const resolvedPath = resolveProjectPath(outputPath, 'outputPath');
  const dir = path.dirname(resolvedPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(resolvedPath, JSON.stringify(data, null, 2));
  return resolvedPath;
}

function toLocalMediaPath(url) {
  const prefix = 'local-media://play/';
  assertNonEmptyString(url, 'url');

  if (!url.startsWith(prefix)) {
    throw new Error('Invalid local-media URL');
  }

  const encodedPath = url.substring(prefix.length);
  return decodeURIComponent(encodedPath);
}

module.exports = {
  AUDIO_EXTENSIONS,
  MEDIA_EXTENSIONS,
  MIME_TYPES,
  VIDEO_EXTENSIONS,
  assertExistingFile,
  getMediaDuration,
  getMimeType,
  readJsonFile,
  readMediaFileBuffer,
  readTextFile,
  scanClips,
  toLocalMediaPath,
  writeJsonFile,
};
