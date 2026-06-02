const { runFlow, stopFlow } = require('../commandRunner');
const { FLOWS } = require('../commands');
const { sendToEventWindow } = require('./windowEvents');

function registerFlowHandlers(ipcMain) {
  ipcMain.handle('get-flows', () => FLOWS);

  ipcMain.handle('run-flow', (event, flowId, params = {}) => {
    const flow = FLOWS.find(f => f.id === flowId);

    if (!flow) {
      return { started: false, error: `Flow "${flowId}" not found` };
    }

    const flowParams = params && typeof params === 'object' && !Array.isArray(params)
      ? params
      : {};

    runFlow(
      flow.steps,
      flowParams,
      (data) => sendToEventWindow(event, 'flow-step-start', data),
      (data) => sendToEventWindow(event, 'flow-output', data),
      (data) => sendToEventWindow(event, 'flow-step-complete', data),
      (data) => sendToEventWindow(event, 'flow-complete', data),
    );

    return { started: true };
  });

  ipcMain.handle('stop-flow', () => stopFlow());
}

module.exports = {
  registerFlowHandlers,
};
