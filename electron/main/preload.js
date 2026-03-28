const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Command execution
  runCommand: (command, options) => ipcRenderer.invoke('run-command', command, options),
  stopCommand: () => ipcRenderer.invoke('stop-command'),
  onCommandOutput: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('command-output', subscription);
    return () => ipcRenderer.removeListener('command-output', subscription);
  },
  onCommandComplete: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('command-complete', subscription);
    return () => ipcRenderer.removeListener('command-complete', subscription);
  },

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
  onFlowStepStart: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('flow-step-start', subscription);
    return () => ipcRenderer.removeListener('flow-step-start', subscription);
  },
  onFlowOutput: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('flow-output', subscription);
    return () => ipcRenderer.removeListener('flow-output', subscription);
  },
  onFlowStepComplete: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('flow-step-complete', subscription);
    return () => ipcRenderer.removeListener('flow-step-complete', subscription);
  },
  onFlowComplete: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('flow-complete', subscription);
    return () => ipcRenderer.removeListener('flow-complete', subscription);
  },

  // App info
  getAppPath: () => ipcRenderer.invoke('get-app-path'),

  // Music Timeline Editor APIs
  scanClips: (folderPath) => ipcRenderer.invoke('scan-clips', folderPath),
  getMediaDuration: (filePath) => ipcRenderer.invoke('get-media-duration', filePath),
  saveMusicTimeline: (outputPath, data) => ipcRenderer.invoke('save-music-timeline', outputPath, data),
  loadMusicTimeline: (filePath) => ipcRenderer.invoke('load-music-timeline', filePath),
  readFileBuffer: (filePath) => ipcRenderer.invoke('read-file-buffer', filePath),
});
