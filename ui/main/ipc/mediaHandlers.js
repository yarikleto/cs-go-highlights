const path = require('path');
const { dialog } = require('electron');
const {
  AUDIO_EXTENSIONS,
  getMediaDuration,
  readJsonFile,
  readMediaFileBuffer,
  scanClips,
  writeJsonFile,
} = require('../services/mediaService');

function registerMediaHandlers(ipcMain) {
  ipcMain.handle('scan-clips', async (event, folderPath) => {
    try {
      return await scanClips(folderPath);
    } catch (e) {
      throw new Error(`Failed to scan clips: ${e.message}`);
    }
  });

  ipcMain.handle('read-file-buffer', async (event, filePath) => {
    try {
      return readMediaFileBuffer(filePath);
    } catch (e) {
      throw new Error(`Failed to read file: ${e.message}`);
    }
  });

  ipcMain.handle('get-media-duration', async (event, filePath) => {
    try {
      return await getMediaDuration(filePath);
    } catch (e) {
      throw new Error(`Failed to get duration: ${e.message}`);
    }
  });

  ipcMain.handle('save-music-timeline', async (event, outputPath, data) => {
    try {
      const resolvedPath = writeJsonFile(outputPath, data);
      return { success: true, path: resolvedPath };
    } catch (e) {
      throw new Error(`Failed to save timeline: ${e.message}`);
    }
  });

  ipcMain.handle('load-music-timeline', async (event, filePath) => {
    try {
      return readJsonFile(filePath);
    } catch (e) {
      throw new Error(`Failed to load timeline: ${e.message}`);
    }
  });

  ipcMain.handle('select-audio-files', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Audio',
          extensions: AUDIO_EXTENSIONS.map(extension => extension.slice(1)),
        },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const audioFiles = [];
    for (const filePath of result.filePaths) {
      try {
        const duration = await getMediaDuration(filePath);
        audioFiles.push({
          filename: path.basename(filePath),
          path: filePath,
          duration,
        });
      } catch (e) {
        console.warn(`Failed to get duration for ${filePath}:`, e.message);
        audioFiles.push({
          filename: path.basename(filePath),
          path: filePath,
          duration: 0,
        });
      }
    }

    return audioFiles;
  });
}

module.exports = {
  registerMediaHandlers,
};
