import { isPlainObject, readJsonBody, sendJson } from '../http.js';
import { JobAlreadyRunningError } from '../jobRunner.js';

export function jobRoutes({ jobRunner, commands, flows }) {
  return [
    {
      method: 'POST',
      path: '/api/jobs/command',
      handler: async ({ req, res }) => {
        const { commandId, options } = await readJsonBody(req);
        const command = commands.find(item => item.id === commandId);
        if (!command) {
          sendJson(res, 404, { started: false, error: `Command "${commandId}" not found` });
          return;
        }
        startJob(res, () => jobRunner.startCommand(command.id, isPlainObject(options) ? options : {}));
      },
    },
    {
      method: 'POST',
      path: '/api/jobs/flow',
      handler: async ({ req, res }) => {
        const { flowId, params } = await readJsonBody(req);
        const flow = flows.find(item => item.id === flowId);
        if (!flow) {
          sendJson(res, 404, { started: false, error: `Flow "${flowId}" not found` });
          return;
        }
        startJob(res, () => jobRunner.startFlow(flow, isPlainObject(params) ? params : {}));
      },
    },
    {
      method: 'POST',
      path: '/api/jobs/stop',
      handler: ({ res }) => sendJson(res, 200, { stopped: jobRunner.stop() }),
    },
  ];
}

function startJob(res, start) {
  try {
    start();
  } catch (error) {
    if (!(error instanceof JobAlreadyRunningError)) throw error;
    sendJson(res, 409, { started: false, error: error.message });
    return;
  }
  sendJson(res, 202, { started: true });
}
