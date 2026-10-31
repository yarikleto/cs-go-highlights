import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream';
import { sendText } from './http.js';

const CONTENT_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
});

export function serveStatic(res, url, distDir) {
  const filePath = resolveStaticPath(url.pathname, distDir);
  const stat = filePath ? statOrNull(filePath) : null;

  if (!stat?.isFile()) {
    sendText(res, 404, 'Not found');
    return;
  }

  res.writeHead(200, {
    'Content-Type': CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache',
  });
  pipeline(fs.createReadStream(filePath), res, (error) => {
    if (error && error.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
      console.error('[ui] Static file failed:', error.message);
    }
  });
}

function resolveStaticPath(pathname, distDir) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath;
  const filePath = path.join(distDir, relativePath);
  return filePath.startsWith(distDir + path.sep) ? filePath : null;
}

function statOrNull(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}
