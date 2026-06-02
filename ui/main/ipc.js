const { ipcMain } = require('electron');
const { registerCommandHandlers } = require('./ipc/commandHandlers');
const { registerConfigHandlers } = require('./ipc/configHandlers');
const { registerDialogHandlers } = require('./ipc/dialogHandlers');
const { registerFileHandlers } = require('./ipc/fileHandlers');
const { registerFlowHandlers } = require('./ipc/flowHandlers');
const { registerMediaHandlers } = require('./ipc/mediaHandlers');

function setupIPC() {
  registerCommandHandlers(ipcMain);
  registerFlowHandlers(ipcMain);
  registerDialogHandlers(ipcMain);
  registerConfigHandlers(ipcMain);
  registerFileHandlers(ipcMain);
  registerMediaHandlers(ipcMain);
}

module.exports = { setupIPC };
