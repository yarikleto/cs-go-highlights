import http from 'node:http';
import {
  allowedHostsFor,
  allowedOriginsFor,
  isAllowedHost,
  isAllowedOrigin,
  isValidToken,
  readCookie,
  sessionCookieHeader,
} from './auth.js';
import { CONTENT_SECURITY_POLICY, SESSION_COOKIE } from './constants.js';
import { sendJson, sendText } from './http.js';
import { createRouter } from './router.js';
import { catalogRoutes } from './routes/catalogRoutes.js';
import { eventRoutes } from './routes/eventRoutes.js';
import { fileRoutes } from './routes/fileRoutes.js';
import { jobRoutes } from './routes/jobRoutes.js';
import { mediaRoutes } from './routes/mediaRoutes.js';
import { musicRoutes } from './routes/musicRoutes.js';
import { serveStatic } from './staticFiles.js';

const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
});

/** Returns a server that is not listening yet; allowed hosts follow whatever port it is bound to. */
export function createUiServer({
  token,
  distDir,
  extraOrigins = [],
  jobRunner,
  commands,
  flows,
  projectRoot,
  probeDuration,
}) {
  const handleRoute = createRouter([
    ...catalogRoutes({ commands, flows }),
    ...jobRoutes({ jobRunner, commands, flows }),
    ...eventRoutes({ jobRunner }),
    ...fileRoutes({ projectRoot }),
    ...mediaRoutes({ probeDuration }),
    ...musicRoutes({ probeDuration }),
  ]);

  const server = http.createServer((req, res) => {
    const { port } = server.address();
    handleRequest({ req, res, port, token, distDir, extraOrigins, handleRoute }).catch((error) => {
      console.error('[ui] Request failed:', error);
      if (res.headersSent) res.destroy();
      else sendText(res, 500, 'Internal server error');
    });
  });
  return server;
}

async function handleRequest({ req, res, port, token, distDir, extraOrigins, handleRoute }) {
  if (!isAllowedHost(req.headers.host, allowedHostsFor(port))) {
    sendText(res, 403, 'Forbidden host');
    return;
  }

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/session') {
    startSession(res, url, token);
    return;
  }

  if (isProtectedPath(url.pathname)) {
    if (!isValidToken(readCookie(req.headers.cookie, SESSION_COOKIE), token)) {
      sendJson(res, 401, { error: 'Not signed in. Open the URL printed by "csgo-highlights ui".' });
      return;
    }
    if (req.method !== 'GET' && !isAllowedOrigin(req.headers.origin, allowedOriginsFor(port, extraOrigins))) {
      sendJson(res, 403, { error: 'Cross-origin request rejected' });
      return;
    }
    if (!await handleRoute(req, res, url)) sendJson(res, 404, { error: `No route for ${req.method} ${url.pathname}` });
    return;
  }

  if (req.method !== 'GET') {
    sendText(res, 405, 'Method not allowed');
    return;
  }
  serveStatic(res, url, distDir);
}

function startSession(res, url, token) {
  if (!isValidToken(url.searchParams.get('token') ?? undefined, token)) {
    sendText(res, 403, 'Invalid session token. Use the URL printed by "csgo-highlights ui".');
    return;
  }

  res.writeHead(302, { Location: '/', 'Set-Cookie': sessionCookieHeader(token) });
  res.end();
}

function isProtectedPath(pathname) {
  return pathname.startsWith('/api/') || pathname === '/media';
}
