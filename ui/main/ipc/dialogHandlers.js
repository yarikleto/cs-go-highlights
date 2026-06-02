const { dialog } = require('electron');

function normalizeFilters(filters) {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
    return [];
  }

  const extensions = Array.isArray(filters.extensions)
    ? filters.extensions
      .filter(extension => typeof extension === 'string' && extension.trim() !== '')
      .map(extension => extension.replace(/^\./, ''))
    : [];

  if (extensions.length === 0) {
    return [];
  }

  return [
    {
      name: typeof filters.name === 'string' && filters.name.trim() !== ''
        ? filters.name
        : 'Files',
      extensions,
    },
    { name: 'All Files', extensions: ['*'] },
  ];
}

function registerDialogHandlers(ipcMain) {
  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle('select-save-file', async (event, filters) => {
    const result = await dialog.showSaveDialog({
      filters: normalizeFilters(filters),
    });

    if (result.canceled) {
      return null;
    }

    return result.filePath;
  });

  ipcMain.handle('select-file', async (event, filters) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: normalizeFilters(filters),
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });
}

module.exports = {
  normalizeFilters,
  registerDialogHandlers,
};
