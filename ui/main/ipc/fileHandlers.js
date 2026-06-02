const { PROJECT_ROOT } = require('../services/paths');
const { readTextFile } = require('../services/mediaService');

function registerFileHandlers(ipcMain) {
  ipcMain.handle('read-file', async (event, filePath) => {
    try {
      return readTextFile(filePath);
    } catch (e) {
      throw new Error(`Failed to read file: ${e.message}`);
    }
  });

  ipcMain.handle('get-app-path', () => PROJECT_ROOT);
}

module.exports = {
  registerFileHandlers,
};
