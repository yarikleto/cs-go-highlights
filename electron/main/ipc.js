const { ipcMain, dialog, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { runCommand, stopCommand, runFlow, stopFlow } = require('./commandRunner');
const { COMMANDS, FLOWS } = require('./commands');

/**
 * Get media duration using ffprobe
 */
function getMediaDuration(filePath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'json',
      filePath
    ];
    
    const ffprobe = spawn('ffprobe', args);
    let stdout = '';
    let stderr = '';
    
    ffprobe.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    ffprobe.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    ffprobe.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed: ${stderr}`));
        return;
      }
      
      try {
        const result = JSON.parse(stdout);
        const duration = parseFloat(result.format?.duration || 0);
        resolve(duration);
      } catch (e) {
        reject(new Error(`Failed to parse ffprobe output: ${e.message}`));
      }
    });
    
    ffprobe.on('error', (err) => {
      reject(new Error(`Failed to run ffprobe: ${err.message}`));
    });
  });
}

/**
 * Setup all IPC handlers
 */
function setupIPC() {
  // Get available commands
  ipcMain.handle('get-commands', () => {
    return COMMANDS;
  });

  // Run a command
  ipcMain.handle('run-command', (event, command, options) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    
    runCommand(
      command,
      options,
      // onOutput
      (data) => {
        if (window && !window.isDestroyed()) {
          window.webContents.send('command-output', data);
        }
      },
      // onComplete
      (result) => {
        if (window && !window.isDestroyed()) {
          window.webContents.send('command-complete', result);
        }
      }
    );
    
    return { started: true };
  });

  // Stop running command
  ipcMain.handle('stop-command', () => {
    return stopCommand();
  });

  // Get available flows
  ipcMain.handle('get-flows', () => {
    return FLOWS;
  });

  // Run a flow
  ipcMain.handle('run-flow', (event, flowId, params) => {
    const flow = FLOWS.find(f => f.id === flowId);
    if (!flow) {
      return { started: false, error: `Flow "${flowId}" not found` };
    }

    const window = BrowserWindow.fromWebContents(event.sender);
    const send = (channel, data) => {
      if (window && !window.isDestroyed()) {
        window.webContents.send(channel, data);
      }
    };

    runFlow(
      flow.steps,
      params,
      (data) => send('flow-step-start', data),
      (data) => send('flow-output', data),
      (data) => send('flow-step-complete', data),
      (data) => send('flow-complete', data),
    );

    return { started: true };
  });

  // Stop running flow
  ipcMain.handle('stop-flow', () => {
    return stopFlow();
  });

  // Select folder dialog
  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    
    return result.filePaths[0];
  });

  // Save file dialog
  ipcMain.handle('select-save-file', async (event, filters) => {
    const dialogFilters = filters ? [filters, { name: 'All Files', extensions: ['*'] }] : [];

    const result = await dialog.showSaveDialog({
      filters: dialogFilters,
    });

    if (result.canceled) {
      return null;
    }

    return result.filePath;
  });

  // Select file dialog
  ipcMain.handle('select-file', async (event, filters) => {
    const dialogFilters = filters ? [filters, { name: 'All Files', extensions: ['*'] }] : [];
    
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: dialogFilters,
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    
    return result.filePaths[0];
  });

  // Read file content
  ipcMain.handle('read-file', async (event, filePath) => {
    try {
      // Resolve relative paths from project root
      const resolvedPath = path.isAbsolute(filePath) 
        ? filePath 
        : path.resolve(__dirname, '../..', filePath);
      
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`File not found: ${resolvedPath}`);
      }
      
      return fs.readFileSync(resolvedPath, 'utf8');
    } catch (e) {
      throw new Error(`Failed to read file: ${e.message}`);
    }
  });

  // Get config
  ipcMain.handle('get-config', async () => {
    const configPath = path.resolve(__dirname, '../../electron-config.json');
    
    try {
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(content);
      }
    } catch (e) {
      console.error('Error loading config:', e);
    }
    
    // Return default config
    return {
      paths: {
        demos: './demos',
        output: './output',
        hlae: 'C:\\Program Files (x86)\\HLAE\\hlae.exe',
        csgo: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive',
      },
      detection: {
        maxDelay: 15,
        minSeriesKills: 3,
        minEnemies: 2,
      },
      padding: {
        before: 4,
        after: 5,
      },
      speedup: {
        startDelay: 2,
        bufferAroundKills: 2,
        minGapDuration: 4,
      },
      slowmo: {
        duration: 1,
        factor: 0.6,
      },
      postprocess: {
        speedupMultiplier: 3,
        showOverlay: true,
      },
      gameVersion: {
        clientVersion: 2000335,
        serverVersion: 2000335,
      },
    };
  });

  // Save config
  ipcMain.handle('save-config', async (event, config) => {
    const configPath = path.resolve(__dirname, '../../electron-config.json');
    
    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      return { success: true };
    } catch (e) {
      console.error('Error saving config:', e);
      return { success: false, error: e.message };
    }
  });

  // Get app path
  ipcMain.handle('get-app-path', () => {
    return path.resolve(__dirname, '../..');
  });

  // =========================================================================
  // Music Timeline Editor handlers
  // =========================================================================

  // Scan folder for video clips
  ipcMain.handle('scan-clips', async (event, folderPath) => {
    try {
      const resolvedPath = path.isAbsolute(folderPath)
        ? folderPath
        : path.resolve(__dirname, '../..', folderPath);

      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Folder not found: ${resolvedPath}`);
      }

      const files = fs.readdirSync(resolvedPath);
      const videoExtensions = ['.mp4', '.avi', '.mkv', '.mov', '.webm'];
      const clips = [];

      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (videoExtensions.includes(ext)) {
          const filePath = path.join(resolvedPath, file);
          try {
            const duration = await getMediaDuration(filePath);
            clips.push({
              filename: file,
              path: filePath,
              duration: duration,
            });
          } catch (e) {
            console.warn(`Failed to get duration for ${file}:`, e.message);
            // Still add the clip but with 0 duration
            clips.push({
              filename: file,
              path: filePath,
              duration: 0,
            });
          }
        }
      }

      // Natural sort by filename (1, 2, 3, ..., 10, 11, ... instead of 1, 10, 11, 2, ...)
      clips.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true, sensitivity: 'base' }));

      return clips;
    } catch (e) {
      throw new Error(`Failed to scan clips: ${e.message}`);
    }
  });

  // Read file as buffer (for loading video/audio into renderer as Blob)
  ipcMain.handle('read-file-buffer', async (event, filePath) => {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      return fs.readFileSync(filePath);
    } catch (e) {
      throw new Error(`Failed to read file: ${e.message}`);
    }
  });

  // Get duration of a single media file
  ipcMain.handle('get-media-duration', async (event, filePath) => {
    try {
      const resolvedPath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(__dirname, '../..', filePath);

      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`File not found: ${resolvedPath}`);
      }

      return await getMediaDuration(resolvedPath);
    } catch (e) {
      throw new Error(`Failed to get duration: ${e.message}`);
    }
  });

  // Save music timeline mapping
  ipcMain.handle('save-music-timeline', async (event, outputPath, data) => {
    try {
      const resolvedPath = path.isAbsolute(outputPath)
        ? outputPath
        : path.resolve(__dirname, '../..', outputPath);

      // Ensure directory exists
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(resolvedPath, JSON.stringify(data, null, 2));
      return { success: true, path: resolvedPath };
    } catch (e) {
      throw new Error(`Failed to save timeline: ${e.message}`);
    }
  });

  // Load music timeline mapping
  ipcMain.handle('load-music-timeline', async (event, filePath) => {
    try {
      const resolvedPath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(__dirname, '../..', filePath);

      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`File not found: ${resolvedPath}`);
      }

      const content = fs.readFileSync(resolvedPath, 'utf8');
      return JSON.parse(content);
    } catch (e) {
      throw new Error(`Failed to load timeline: ${e.message}`);
    }
  });

  // Select multiple audio files
  ipcMain.handle('select-audio-files', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'] }
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    // Get duration for each audio file
    const audioFiles = [];
    for (const filePath of result.filePaths) {
      try {
        const duration = await getMediaDuration(filePath);
        audioFiles.push({
          filename: path.basename(filePath),
          path: filePath,
          duration: duration,
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

module.exports = { setupIPC };
