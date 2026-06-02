const { app, BrowserWindow, Menu, protocol } = require('electron');
const path = require('path');
const { setupIPC } = require('./ipc');
const { stopCommand } = require('./commandRunner');
const {
  handleLocalMediaRequests,
  ignoreAbortedMediaRequestErrors,
  registerLocalMediaScheme,
} = require('./services/localMediaProtocol');

ignoreAbortedMediaRequestErrors();

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
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Load the app
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
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

registerLocalMediaScheme(protocol);

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  handleLocalMediaRequests(protocol);
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
