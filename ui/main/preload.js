const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  if (typeof callback !== 'function') {
    throw new TypeError('callback must be a function');
  }

  const subscription = (event, data) => callback(data);
  ipcRenderer.on(channel, subscription);
  return () => ipcRenderer.removeListener(channel, subscription);
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Command execution
  runCommand: (command, options) => ipcRenderer.invoke('run-command', command, options),
  stopCommand: () => ipcRenderer.invoke('stop-command'),
  onCommandOutput: (callback) => subscribe('command-output', callback),
  onCommandComplete: (callback) => subscribe('command-complete', callback),

  // Dialog APIs
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectFile: (filters) => ipcRenderer.invoke('select-file', filters),
  selectSaveFile: (filters) => ipcRenderer.invoke('select-save-file', filters),
  selectAudioFiles: () => ipcRenderer.invoke('select-audio-files'),

  // Config APIs
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),

  // File APIs
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),

  // Commands metadata
  getCommands: () => ipcRenderer.invoke('get-commands'),

  // Flows
  getFlows: () => ipcRenderer.invoke('get-flows'),
  runFlow: (flowId, params) => ipcRenderer.invoke('run-flow', flowId, params),
  stopFlow: () => ipcRenderer.invoke('stop-flow'),
  onFlowStepStart: (callback) => subscribe('flow-step-start', callback),
  onFlowOutput: (callback) => subscribe('flow-output', callback),
  onFlowStepComplete: (callback) => subscribe('flow-step-complete', callback),
  onFlowComplete: (callback) => subscribe('flow-complete', callback),

  // App info
  getAppPath: () => ipcRenderer.invoke('get-app-path'),

  // Music Timeline Editor APIs
  scanClips: (folderPath) => ipcRenderer.invoke('scan-clips', folderPath),
  getMediaDuration: (filePath) => ipcRenderer.invoke('get-media-duration', filePath),
  saveMusicTimeline: (outputPath, data) => ipcRenderer.invoke('save-music-timeline', outputPath, data),
  loadMusicTimeline: (filePath) => ipcRenderer.invoke('load-music-timeline', filePath),
  readFileBuffer: (filePath) => ipcRenderer.invoke('read-file-buffer', filePath),
});
