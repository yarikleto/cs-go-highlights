const { loadConfig, saveConfig } = require('../services/configService');

function registerConfigHandlers(ipcMain) {
  ipcMain.handle('get-config', async () => loadConfig());

  ipcMain.handle('save-config', async (event, config) => {
    try {
      saveConfig(config);
      return { success: true };
    } catch (e) {
      console.error('Error saving config:', e);
      return { success: false, error: e.message };
    }
  });
}

module.exports = {
  registerConfigHandlers,
};
