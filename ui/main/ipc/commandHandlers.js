const { runCommand, stopCommand } = require('../commandRunner');
const { COMMANDS } = require('../commands');
const { sendToEventWindow } = require('./windowEvents');

function registerCommandHandlers(ipcMain) {
  ipcMain.handle('get-commands', () => COMMANDS);

  ipcMain.handle('run-command', (event, command, options = {}) => {
    const commandDefinition = COMMANDS.find(item => item.id === command);

    if (!commandDefinition) {
      return { started: false, error: `Command "${command}" not found` };
    }

    const commandOptions = options && typeof options === 'object' && !Array.isArray(options)
      ? options
      : {};

    runCommand(
      command,
      commandOptions,
      (data) => sendToEventWindow(event, 'command-output', data),
      (result) => sendToEventWindow(event, 'command-complete', result),
    );

    return { started: true };
  });

  ipcMain.handle('stop-command', () => stopCommand());
}

module.exports = {
  registerCommandHandlers,
};
