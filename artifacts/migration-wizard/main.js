'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ── Paths ──────────────────────────────────────────────────────────────────────
const isDev = process.argv.includes('--dev') || !app.isPackaged;

// ── Window ─────────────────────────────────────────────────────────────────────
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 680,
    minWidth: 800,
    minHeight: 580,
    resizable: true,
    title: 'ERP Migration Wizard',
    backgroundColor: '#0d0f1a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC Handlers ───────────────────────────────────────────────────────────────

// 1. Open file dialog — pick a .db file
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Database File',
    filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// 2. Detect default AppData database path
ipcMain.handle('db:detectDefault', () => {
  const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const defaultPath = path.join(appdata, 'ShoeStorePOS', 'store.db');
  return { path: defaultPath, exists: fs.existsSync(defaultPath) };
});

// 3. Validate database — inspect schema and collect stats
ipcMain.handle('db:validate', (_event, dbPath) => {
  try {
    const { validateDatabase } = require('./migration/validator');
    return validateDatabase(dbPath);
  } catch (err) {
    return { valid: false, error: err.message };
  }
});

// 4. Take pre-migration snapshot of counts and balances
ipcMain.handle('db:snapshot', (_event, dbPath) => {
  try {
    const { takeSnapshot } = require('./migration/validator');
    return takeSnapshot(dbPath);
  } catch (err) {
    return { error: err.message };
  }
});

// 5. Start migration — sends progress events, resolves on complete
ipcMain.handle('migration:start', async (event, dbPath, choices) => {
  try {
    const { runMigration } = require('./migration/engine');

    const onProgress = (data) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('migration:progress', data);
      }
    };

    const result = await runMigration(dbPath, choices, onProgress);
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message, stack: err.stack };
  }
});

// 6. Export log to file
ipcMain.handle('log:export', async (_event, logLines) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Migration Log',
    defaultPath: `migration-log-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`,
    filters: [{ name: 'Text Files', extensions: ['txt', 'log'] }],
  });
  if (result.canceled || !result.filePath) return { saved: false };
  try {
    fs.writeFileSync(result.filePath, logLines.join('\n'), 'utf-8');
    return { saved: true, path: result.filePath };
  } catch (err) {
    return { saved: false, error: err.message };
  }
});

// 7. Open folder in Explorer
ipcMain.handle('shell:openPath', (_event, filePath) => {
  shell.showItemInFolder(filePath);
});
