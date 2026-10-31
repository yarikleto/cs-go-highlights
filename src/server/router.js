import { HttpError, sendJson } from './http.js';

/** @returns {(req, res, url: URL) => Promise<boolean>} resolves false when no route matches */
export function createRouter(routes) {
  const routesByKey = new Map(routes.map(route => [`${route.method} ${route.path}`, route.handler]));

  return async function handleRoute(req, res, url) {
    const handler = routesByKey.get(`${req.method} ${url.pathname}`);
    if (!handler) return false;

    try {
      await handler({ req, res, url });
    } catch (error) {
      sendError(res, error);
    }
    return true;
  };
}

function sendError(res, error) {
  if (res.headersSent) {
    res.destroy();
    return;
  }

  const status = statusFor(error);
  if (status === 500) console.error('[ui] Request failed:', error);
  sendJson(res, status, { error: error.message });
}

function statusFor(error) {
  if (error instanceof HttpError) return error.status;
  if (error.code === 'ENOENT') return 404;
  return 500;
}
