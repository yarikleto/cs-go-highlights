const fs = require('fs');
const {
  MEDIA_EXTENSIONS,
  assertExistingFile,
  getMimeType,
  toLocalMediaPath,
} = require('./mediaService');

const SCHEME = 'local-media';

function registerLocalMediaScheme(protocol) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        stream: true,
      },
    },
  ]);
}

function parseRange(rangeHeader, fileSize) {
  if (!rangeHeader) {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) {
    return null;
  }

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) {
    return null;
  }

  let start;
  let end;

  if (!rawStart) {
    const suffixLength = parseInt(rawEnd, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return { invalid: true };
    }

    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  } else {
    start = parseInt(rawStart, 10);
    end = rawEnd ? parseInt(rawEnd, 10) : fileSize - 1;
  }

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    start >= fileSize
  ) {
    return { invalid: true };
  }

  return {
    start,
    end: Math.min(end, fileSize - 1),
  };
}

function readRange(filePath, start, end) {
  const chunkSize = end - start + 1;
  const buffer = Buffer.alloc(chunkSize);
  const fd = fs.openSync(filePath, 'r');

  try {
    fs.readSync(fd, buffer, 0, chunkSize, start);
  } finally {
    fs.closeSync(fd);
  }

  return buffer;
}

function handleLocalMediaRequests(protocol) {
  protocol.handle(SCHEME, (request) => {
    let filePath = '';

    try {
      filePath = toLocalMediaPath(request.url);
      const { resolvedPath, stat } = assertExistingFile(filePath, MEDIA_EXTENSIONS);
      const fileSize = stat.size;
      const contentType = getMimeType(resolvedPath);
      const range = parseRange(request.headers.get('range'), fileSize);

      if (range?.invalid) {
        return new Response('Range Not Satisfiable', {
          status: 416,
          headers: {
            'Content-Range': `bytes */${fileSize}`,
          },
        });
      }

      if (range) {
        const buffer = readRange(resolvedPath, range.start, range.end);

        return new Response(buffer, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${range.start}-${range.end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(buffer.length),
            'Content-Type': contentType,
          },
        });
      }

      const buffer = fs.readFileSync(resolvedPath);
      return new Response(buffer, {
        status: 200,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': String(fileSize),
          'Content-Type': contentType,
        },
      });
    } catch (err) {
      console.error('[local-media] Error serving:', filePath || request.url, err.message);
      return new Response('File not found', { status: 404 });
    }
  });
}

function ignoreAbortedMediaRequestErrors() {
  process.on('uncaughtException', (err) => {
    if (err.code === 'ERR_INVALID_STATE' && err.message.includes('Controller is already closed')) {
      return;
    }

    console.error('Uncaught exception:', err);
    throw err;
  });
}

module.exports = {
  ignoreAbortedMediaRequestErrors,
  handleLocalMediaRequests,
  registerLocalMediaScheme,
};
