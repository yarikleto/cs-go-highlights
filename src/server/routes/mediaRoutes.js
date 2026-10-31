import fs from 'node:fs';
import { pipeline } from 'node:stream';
import { requireQuery, sendJson } from '../http.js';
import { MEDIA_EXTENSIONS, assertExistingFile, getMimeType } from '../mediaFiles.js';
import { parseRange } from '../range.js';

export function mediaRoutes({ probeDuration }) {
  return [
    { method: 'GET', path: '/media', handler: ({ req, res, url }) => streamMedia(req, res, requireQuery(url, 'path')) },
    {
      method: 'GET',
      path: '/api/media/duration',
      handler: async ({ res, url }) => {
        const { resolvedPath } = assertExistingFile(requireQuery(url, 'path'), { extensions: MEDIA_EXTENSIONS });
        sendJson(res, 200, { duration: await probeDuration(resolvedPath) });
      },
    },
  ];
}

function streamMedia(req, res, filePath) {
  const { resolvedPath, size } = assertExistingFile(filePath, { extensions: MEDIA_EXTENSIONS });
  const range = parseRange(req.headers.range, size);

  if (range?.invalid) {
    res.writeHead(416, { 'Content-Range': `bytes */${size}` });
    res.end();
    return;
  }

  const { start, end } = range ?? { start: 0, end: size - 1 };
  const headers = {
    'Accept-Ranges': 'bytes',
    'Content-Type': getMimeType(resolvedPath),
    'Content-Length': size === 0 ? 0 : end - start + 1,
  };

  if (size === 0) {
    res.writeHead(200, headers);
    res.end();
    return;
  }

  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  res.writeHead(range ? 206 : 200, headers);
  pipeline(fs.createReadStream(resolvedPath, { start, end }), res, reportUnexpectedStreamError);
}

/** Browsers abort media requests on every seek, so a premature close is routine, not an error. */
function reportUnexpectedStreamError(error) {
  if (error && error.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
    console.error('[ui] Media stream failed:', error.message);
  }
}
