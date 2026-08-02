'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Creates a timestamped backup copy of the SQLite database file.
 * Returns { backupPath, sizeBytes } on success.
 * Throws on any I/O error.
 */
function createBackup(dbPath) {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database file not found: ${dbPath}`);
  }

  const dir = path.dirname(dbPath);
  const base = path.basename(dbPath, path.extname(dbPath));
  const ext = path.extname(dbPath);
  const timestamp = new Date()
    .toISOString()
    .replace(/T/, '_')
    .replace(/:/g, '-')
    .replace(/\..+/, '');

  const backupPath = path.join(dir, `${base}.backup-${timestamp}${ext}`);

  fs.copyFileSync(dbPath, backupPath);

  const stats = fs.statSync(backupPath);

  return {
    backupPath,
    sizeBytes: stats.size,
    timestamp,
  };
}

module.exports = { createBackup };
