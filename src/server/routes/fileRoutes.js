import { listDirectory, listRoots } from '../directoryListing.js';
import { requireQuery, sendJson, sendText } from '../http.js';
import { readTextFile } from '../mediaFiles.js';

export function fileRoutes({ projectRoot }) {
  return [
    {
      method: 'GET',
      path: '/api/files/text',
      handler: ({ res, url }) => sendText(res, 200, readTextFile(requireQuery(url, 'path'))),
    },
    {
      method: 'GET',
      path: '/api/fs/list',
      handler: ({ res, url }) => sendJson(res, 200, listDirectory(url.searchParams.get('path') || '', { projectRoot })),
    },
    { method: 'GET', path: '/api/fs/roots', handler: ({ res }) => sendJson(res, 200, listRoots()) },
  ];
}
