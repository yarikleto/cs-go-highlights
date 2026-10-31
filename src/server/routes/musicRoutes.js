import { HttpError, readJsonBody, requireQuery, sendJson } from '../http.js';
import { describeAudioFiles, readJsonFile, scanClips, writeJsonFile } from '../mediaFiles.js';

export function musicRoutes({ probeDuration }) {
  return [
    {
      method: 'GET',
      path: '/api/music/clips',
      handler: async ({ res, url }) => sendJson(res, 200, await scanClips(requireQuery(url, 'folder'), { probeDuration })),
    },
    {
      method: 'POST',
      path: '/api/music/audio-files',
      handler: async ({ req, res }) => {
        const { paths } = await readJsonBody(req);
        if (!Array.isArray(paths) || !paths.every(item => typeof item === 'string')) {
          throw new HttpError(400, 'paths must be an array of strings');
        }
        sendJson(res, 200, await describeAudioFiles(paths, { probeDuration }));
      },
    },
    {
      method: 'GET',
      path: '/api/music/timeline',
      handler: ({ res, url }) => sendJson(res, 200, readJsonFile(requireQuery(url, 'path'))),
    },
    {
      method: 'PUT',
      path: '/api/music/timeline',
      handler: async ({ req, res }) => {
        const { outputPath, data } = await readJsonBody(req);
        sendJson(res, 200, { success: true, path: writeJsonFile(outputPath, data) });
      },
    },
  ];
}
