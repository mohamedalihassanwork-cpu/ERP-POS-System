'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('migrationAPI', {
  // File operations
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  detectDefaultDb: () => ipcRenderer.invoke('db:detectDefault'),

  // Database inspection
  validateDb: (dbPath) => ipcRenderer.invoke('db:validate', dbPath),
  takeSnapshot: (dbPath) => ipcRenderer.invoke('db:snapshot', dbPath),

  // Migration execution
  startMigration: (dbPath, choices) =>
    ipcRenderer.invoke('migration:start', dbPath, choices),

  // Progress event subscription
  onProgress: (callback) => {
    ipcRenderer.on('migration:progress', (_event, data) => callback(data));
  },
  removeProgressListeners: () => {
    ipcRenderer.removeAllListeners('migration:progress');
  },

  // Post-migration utilities
  exportLog: (logLines) => ipcRenderer.invoke('log:export', logLines),
  openPath: (filePath) => ipcRenderer.invoke('shell:openPath', filePath),
});
