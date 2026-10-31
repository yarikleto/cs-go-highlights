import { sendJson } from '../http.js';

export function catalogRoutes({ commands, flows }) {
  return [
    { method: 'GET', path: '/api/commands', handler: ({ res }) => sendJson(res, 200, commands) },
    { method: 'GET', path: '/api/flows', handler: ({ res }) => sendJson(res, 200, flows) },
  ];
}
