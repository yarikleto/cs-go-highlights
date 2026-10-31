import { HttpError, isPlainObject, readJsonBody, sendJson } from '../http.js';
import { loadUiConfig, saveUiConfig } from '../uiConfig.js';

export function configRoutes({ configPath }) {
  return [
    { method: 'GET', path: '/api/config', handler: ({ res }) => sendJson(res, 200, loadUiConfig(configPath)) },
    {
      method: 'PUT',
      path: '/api/config',
      handler: async ({ req, res }) => {
        const config = await readJsonBody(req);
        if (!isPlainObject(config)) throw new HttpError(400, 'config must be an object');
        saveUiConfig(configPath, config);
        sendJson(res, 200, { success: true });
      },
    },
  ];
}
