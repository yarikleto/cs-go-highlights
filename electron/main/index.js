const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { setupIPC } = require('./ipc');
const { stopCommand } = require('./commandRunner');

// Disable all security restrictions
app.commandLine.appendSwitch('disable-web-security');
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');

const MIME_TYPES = {
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
};

// Suppress harmless "Controller is already closed" errors from aborted media requests
process.on('uncaughtException', (err) => {
  if (err.code === 'ERR_INVALID_STATE' && err.message.includes('Controller is already closed')) {
    // Browser aborted a media range request — safe to ignore
    return;
  }
  console.error('Uncaught exception:', err);
  // Re-throw non-media errors
  throw err;
});

// Handle creating/removing shortcuts on Windows when installing/uninstalling
try {
  if (require('electron-squirrel-startup')) {
    app.quit();
  }
} catch (e) {
  // electron-squirrel-startup not available (development mode)
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      allowRunningInsecureContent: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Load the app
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    // Kill any running command when window closes
    stopCommand();
    mainWindow = null;
  });
}

// Register custom protocol for serving local media files
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-media',
    privileges: {
      stream: true,
      bypassCSP: true,
      supportFetchAPI: true,
    },
  },
]);

app.whenReady().then(() => {
  // Handle local-media:// protocol — all reads via Buffer (no streams)
  protocol.handle('local-media', (request) => {
    const raw = request.url;
    const prefix = 'local-media://play/';
    let filePath = decodeURIComponent(raw.substring(prefix.length));

    try {
      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const rangeHeader = request.headers.get('range');

      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
          const chunkSize = end - start + 1;

          const buffer = Buffer.alloc(chunkSize);
          const fd = fs.openSync(filePath, 'r');
          fs.readSync(fd, buffer, 0, chunkSize, start);
          fs.closeSync(fd);

          return new Response(buffer, {
            status: 206,
            headers: {
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': String(chunkSize),
              'Content-Type': contentType,
            },
          });
        }
      }

      // No Range — read full file into buffer
      const buffer = fs.readFileSync(filePath);
      return new Response(buffer, {
        status: 200,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': String(fileSize),
          'Content-Type': contentType,
        },
      });
    } catch (err) {
      console.error('[local-media] Error serving:', filePath, err.message);
      return new Response('File not found', { status: 404 });
    }
  });

  setupIPC();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Kill any running processes before quitting
app.on('before-quit', () => {
  stopCommand();
});
