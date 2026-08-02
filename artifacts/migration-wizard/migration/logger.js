'use strict';

/**
 * In-memory log buffer + callback-based streaming logger.
 * Timestamps every entry with ISO strings.
 */
class Logger {
  constructor(onLog) {
    this.lines = [];
    this.onLog = onLog || null;
  }

  _append(level, message) {
    const ts = new Date().toISOString().replace('T', ' ').replace(/\..+/, '');
    const line = `[${ts}] [${level.padEnd(5)}] ${message}`;
    this.lines.push(line);
    if (this.onLog) this.onLog({ level, message, line, timestamp: ts });
    return line;
  }

  info(message)  { return this._append('INFO',  message); }
  warn(message)  { return this._append('WARN',  message); }
  error(message) { return this._append('ERROR', message); }
  debug(message) { return this._append('DEBUG', message); }
  step(message)  { return this._append('STEP',  message); }

  separator() {
    const line = '─'.repeat(60);
    this.lines.push(line);
    if (this.onLog) this.onLog({ level: 'DIVIDER', message: '', line, timestamp: '' });
  }

  getLines() { return [...this.lines]; }

  getSummary() {
    const warnings = this.lines.filter(l => l.includes('[WARN ]')).length;
    const errors   = this.lines.filter(l => l.includes('[ERROR]')).length;
    return { totalLines: this.lines.length, warnings, errors };
  }
}

module.exports = { Logger };
