'use strict';

// ── App State ─────────────────────────────────────────────────────────────────
const App = {
  currentScreen: 0,
  dbPath: null,
  validationResult: null,
  preSnapshot: null,
  backupResult: null,
  migrationReport: null,
  logLines: [],

  // Wizard choices — defaults set here, updated by UI controls
  choices: {
    shiftStartHour: 11,
    primaryCashierId: null,
    createAccountsForOthers: true,
    convertSessions: true,
  },

  // Step labels for progress screen
  MIGRATION_STEPS: [
    { label: 'Pre-migration snapshot', icon: '📸' },
    { label: 'Creating database backup', icon: '💾' },
    { label: 'Applying schema migrations v2–v6', icon: '📐' },
    { label: 'Converting treasury sessions → operational days', icon: '🔄' },
    { label: 'Creating cashier balance snapshots', icon: '📊' },
    { label: 'Assigning treasury accounts to cashiers', icon: '💰' },
    { label: 'Fixing salary_records unique index', icon: '📋' },
    { label: 'Updating migration version registry', icon: '🗂️' },
    { label: 'Database integrity checks', icon: '🔍' },
    { label: 'Post-migration validation', icon: '✅' },
  ],

  // ── Navigation ──────────────────────────────────────────────────────────────
  navigate(screenIndex) {
    if (screenIndex < 0 || screenIndex > 8) return;

    // Deactivate current
    const current = document.getElementById(`screen-${this.currentScreen}`);
    if (current) current.classList.remove('active');

    // Activate new
    this.currentScreen = screenIndex;
    const next = document.getElementById(`screen-${screenIndex}`);
    if (next) {
      next.classList.add('active');
      // Trigger a minor reflow for the CSS transition
      void next.offsetWidth;
    }

    // Update sidebar
    document.querySelectorAll('.step-item').forEach(el => {
      const s = parseInt(el.dataset.step);
      el.classList.remove('active', 'done');
      if (s === screenIndex) el.classList.add('active');
      else if (s < screenIndex) el.classList.add('done');
    });
  },

  // ── Screen 1: Database Selection ────────────────────────────────────────────
  async initSelectScreen() {
    const result = await window.migrationAPI.detectDefaultDb();
    const pathEl = document.getElementById('default-path-text');
    const badgeEl = document.getElementById('default-path-badge');
    const useBtn = document.getElementById('btn-use-default');

    pathEl.textContent = result.path;

    if (result.exists) {
      badgeEl.textContent = 'Found';
      badgeEl.className = 'path-badge found';
      useBtn.disabled = false;
    } else {
      badgeEl.textContent = 'Not found';
      badgeEl.className = 'path-badge not-found';
      useBtn.disabled = true;
    }
  },

  setSelectedPath(p) {
    this.dbPath = p;
    const card = document.getElementById('selected-file-card');
    const pathEl = document.getElementById('selected-path-text');
    const btn = document.getElementById('btn-validate');

    pathEl.textContent = p;
    card.style.display = 'block';
    btn.disabled = false;
  },

  async browseDb() {
    const p = await window.migrationAPI.openFileDialog();
    if (p) this.setSelectedPath(p);
  },

  useDefaultDb() {
    const pathEl = document.getElementById('default-path-text');
    this.setSelectedPath(pathEl.textContent);
  },

  // ── Screen 2: Validation ────────────────────────────────────────────────────
  async validateDb() {
    this.navigate(2);

    document.getElementById('validation-loading').style.display = 'flex';
    document.getElementById('validation-result').style.display = 'none';
    document.getElementById('validation-actions').style.display = 'none';

    const result = await window.migrationAPI.validateDb(this.dbPath);
    this.validationResult = result;

    document.getElementById('validation-loading').style.display = 'none';
    document.getElementById('validation-result').style.display = 'block';
    document.getElementById('validation-actions').style.display = 'flex';

    const banner = document.getElementById('validation-banner');

    if (!result.valid) {
      banner.className = 'status-banner error';
      banner.innerHTML = `<span>❌</span> Validation Failed: ${result.error}`;
      document.getElementById('btn-to-summary').disabled = true;
      return;
    }

    if (!result.needsMigration) {
      banner.className = 'status-banner warn';
      banner.innerHTML = `<span>⚠️</span> Database is already at the latest schema version. Migration may not be needed.`;
    } else {
      banner.className = 'status-banner success';
      banner.innerHTML = `<span>✅</span> Database validated — ${result.pendingVersions.length} migration(s) to apply`;
    }

    // Info grid
    const grid = document.getElementById('validation-grid');
    const sizeKB = (result.fileSizeBytes / 1024).toFixed(0);
    const tiles = [
      { value: result.storeName,     label: 'Store Name' },
      { value: `v${result.appliedVersion}`, label: 'Current Schema' },
      { value: `${sizeKB} KB`,       label: 'File Size' },
      { value: result.counts.products || 0,     label: 'Products' },
      { value: result.counts.invoices || 0,     label: 'Invoices' },
      { value: result.counts.treasury_transactions || 0, label: 'Transactions' },
    ];
    grid.innerHTML = tiles.map(t => `
      <div class="info-tile">
        <span class="tile-value">${t.value}</span>
        <span class="tile-label">${t.label}</span>
      </div>
    `).join('');

    // Pending migrations
    if (result.pendingVersions.length > 0) {
      const pendingCard = document.getElementById('pending-migrations-card');
      const pendingList = document.getElementById('pending-migrations-list');
      pendingCard.style.display = 'block';

      const names = {
        2: 'Shift Start Hour',
        3: 'Per-Cashier Treasury Accounts',
        4: 'Operational Days Table',
        5: 'Cashier Balance Snapshots',
        6: 'Treasury Account Index Fix',
      };
      pendingList.innerHTML = result.pendingVersions.map(v =>
        `<span class="migration-badge">v${v}: ${names[v] || 'Schema Update'}</span>`
      ).join('');
    }

    // Populate questions screen with live data
    this.populateQuestionsScreen(result);
  },

  populateQuestionsScreen(result) {
    // Q2: Cashier radio buttons
    const radioGroup = document.getElementById('cashier-radio-group');
    radioGroup.innerHTML = '';

    if (result.users && result.users.length > 0) {
      result.users.forEach((user, i) => {
        const isFirst = i === 0;
        if (isFirst) this.choices.primaryCashierId = user.id;

        const label = document.createElement('label');
        label.className = 'radio-option';
        label.innerHTML = `
          <input type="radio" name="cashier" value="${user.id}" ${isFirst ? 'checked' : ''}
            onchange="App.choices.primaryCashierId = '${user.id}'" />
          <div>
            <strong>${user.full_name} (${user.username})</strong>
            <p>Role: ${user.role}</p>
          </div>
        `;
        radioGroup.appendChild(label);
      });

      // "Store-level (no cashier)" option
      const noneLabel = document.createElement('label');
      noneLabel.className = 'radio-option';
      noneLabel.innerHTML = `
        <input type="radio" name="cashier" value=""
          onchange="App.choices.primaryCashierId = null" />
        <div>
          <strong>Keep store-level (no specific cashier)</strong>
          <p>Accounts will remain shared. Cashier-specific accounts will be created on first login.</p>
        </div>
      `;
      radioGroup.appendChild(noneLabel);
    }

    // Q3: Sessions
    if (result.sessions && result.sessions.length > 0) {
      const sessCard = document.getElementById('sessions-question-card');
      sessCard.style.display = 'block';

      const sessList = document.getElementById('sessions-detail-list');
      sessList.innerHTML = result.sessions.map(s => {
        const date = new Date(s.opened_at).toLocaleDateString('en-GB');
        return `
          <div class="session-item">
            <span>${s.account_type} Session</span>
            <span>${s.status}</span>
            <span>Opened ${date}</span>
            <span>Balance: ${s.opening_balance} EGP</span>
          </div>
        `;
      }).join('');
    }
  },

  // ── Screen 3: Summary ───────────────────────────────────────────────────────
  populateSummary() {
    const schemaList = document.getElementById('schema-change-list');
    const dataList = document.getElementById('data-change-list');

    const schemaChanges = [
      'Add shift_start_hour to store_settings',
      'Add user_id to treasury_accounts',
      'Add operational_day_id to treasury_transactions',
      'Create operational_days table',
      'Create cashier_balance_snapshots table',
      'Fix salary_records unique index (3→2 columns)',
    ];

    const vr = this.validationResult;
    const sessionCount = vr?.sessions?.length || 0;
    const userCount = vr?.users?.length || 0;

    const dataChanges = [
      sessionCount > 0
        ? `Convert ${sessionCount} treasury session(s) → operational days`
        : 'No treasury sessions to convert',
      'Create OPENING/CLOSING balance snapshots for historical days',
      `Assign ${userCount > 0 ? userCount : 'existing'} cashier treasury accounts`,
      'Fix salary record unique index (auto-resolve conflicts if any)',
      'Record migration versions v2–v6 in registry',
    ];

    schemaList.innerHTML = schemaChanges.map(c => `<li>${c}</li>`).join('');
    dataList.innerHTML = dataChanges.map(c => `<li>${c}</li>`).join('');

    const decisionsCard = document.getElementById('decisions-needed-card');
    const decisionsCount = document.getElementById('decisions-count');
    const numDecisions = sessionCount > 0 ? 3 : 2;
    decisionsCount.textContent = `${numDecisions} decision${numDecisions > 1 ? 's' : ''} required`;
  },

  // ── Screen 5: Preview ───────────────────────────────────────────────────────
  populatePreview() {
    const stepsEl = document.getElementById('preview-steps');
    const steps = [
      { label: 'Take pre-migration snapshot (counts, balances)', sub: 'Baseline for post-validation' },
      { label: 'Create timestamped database backup', sub: `Target: same folder as ${this.dbPath ? this.dbPath.split(/[\\/]/).pop() : 'store.db'}` },
      { label: 'Apply schema migrations v2–v6 (DDL)', sub: 'Add columns, create tables, fix indexes' },
      {
        label: `Convert ${this.validationResult?.sessions?.length || 0} treasury session(s) → operational_days`,
        sub: this.choices.convertSessions ? 'Session UUIDs preserved for FK integrity' : 'Skipped (user chose to keep legacy data)'
      },
      { label: 'Create cashier_balance_snapshots for historical days', sub: 'OPENING + CLOSING snapshots per converted day' },
      {
        label: `Assign CASH/CARD/INSTAPAY/WALLET accounts to cashier`,
        sub: this.choices.primaryCashierId
          ? `Primary: ${this.validationResult?.users?.find(u => u.id === this.choices.primaryCashierId)?.full_name || 'selected user'}`
          : 'Store-level (no assignment)'
      },
      { label: 'Fix salary_records unique index', sub: 'Drop 3-column index → create 2-column index' },
      { label: 'Record migrations v2–v6 in __schema_migrations', sub: 'ERP will skip these on next startup' },
      { label: 'Database integrity check (PRAGMA foreign_key_check)', sub: 'Verify 0 FK violations' },
      { label: 'Post-migration validation suite (20+ checks)', sub: 'Schema, counts, balances, FK integrity' },
    ];

    stepsEl.innerHTML = steps.map((s, i) => `
      <div class="preview-step">
        <div class="preview-step-num">${i + 1}</div>
        <div>
          <div class="preview-step-text">${s.label}</div>
          <div class="preview-step-sub">${s.sub}</div>
        </div>
      </div>
    `).join('');

    // Choices table
    const tableEl = document.getElementById('choices-table');
    const selectedUser = this.choices.primaryCashierId
      ? (this.validationResult?.users?.find(u => u.id === this.choices.primaryCashierId)?.full_name || this.choices.primaryCashierId)
      : 'Store-level (none)';

    tableEl.innerHTML = `
      <tr><td>Shift start hour</td><td>${this.choices.shiftStartHour}:00</td></tr>
      <tr><td>Primary cashier</td><td>${selectedUser}</td></tr>
      <tr><td>Create accounts for other users</td><td>${this.choices.createAccountsForOthers ? 'Yes' : 'No'}</td></tr>
      <tr><td>Convert treasury sessions</td><td>${this.choices.convertSessions ? 'Yes — convert to operational days' : 'No — keep as legacy data'}</td></tr>
    `;
  },

  // ── Screen 6: Backup ─────────────────────────────────────────────────────────
  async startBackup() {
    this.navigate(6);
    document.getElementById('backup-running').style.display = 'block';
    document.getElementById('backup-done').style.display = 'none';

    // Take snapshot first (non-blocking, for post-migration comparison)
    this.preSnapshot = await window.migrationAPI.takeSnapshot(this.dbPath);

    // Simulate short delay for UX then start migration directly
    // Backup is created as the first step inside the migration engine
    setTimeout(() => {
      document.getElementById('backup-running').style.display = 'none';
      document.getElementById('backup-done').style.display = 'block';
      document.getElementById('backup-info').innerHTML = `
        <div class="backup-info-row">
          <span>Database</span>
          <span>${this.dbPath ? this.dbPath.split(/[\\/]/).pop() : 'store.db'}</span>
        </div>
        <div class="backup-info-row">
          <span>Location</span>
          <span>Same folder — .backup-[timestamp]</span>
        </div>
        <div class="backup-info-row">
          <span>Status</span>
          <span style="color:var(--success)">✓ Ready</span>
        </div>
      `;
    }, 800);
  },

  openBackupFolder() {
    if (this.backupResult && this.backupResult.backupPath) {
      window.migrationAPI.openPath(this.backupResult.backupPath);
    } else if (this.dbPath) {
      const parts = this.dbPath.split(/[\\/]/);
      parts.pop();
      window.migrationAPI.openPath(parts.join('/'));
    }
  },

  // ── Screen 7: Migration Progress ─────────────────────────────────────────────
  async startMigration() {
    this.navigate(7);
    this.logLines = [];

    // Render step rows
    const stepsEl = document.getElementById('migration-step-list');
    stepsEl.innerHTML = this.MIGRATION_STEPS.map((s, i) => `
      <div class="m-step pending" id="m-step-${i}">
        <span class="m-step-icon">${s.icon}</span>
        <span class="m-step-text">${s.label}</span>
        <span class="m-step-detail" id="m-step-detail-${i}"></span>
      </div>
    `).join('');

    const progressBar = document.getElementById('migration-progress-bar');
    const progressPct = document.getElementById('progress-pct');
    const logOutput = document.getElementById('log-output');
    const logCount = document.getElementById('log-line-count');
    const totalSteps = this.MIGRATION_STEPS.length;

    // Subscribe to progress events
    window.migrationAPI.removeProgressListeners();
    window.migrationAPI.onProgress((data) => {
      if (data.type === 'log') {
        this.logLines.push(data.line);
        const span = document.createElement('span');
        span.className = `log-line ${this._logLevel(data.line)}`;
        span.textContent = data.line;
        logOutput.appendChild(span);
        logOutput.appendChild(document.createElement('br'));
        logOutput.scrollTop = logOutput.scrollHeight;
        logCount.textContent = `${this.logLines.length} lines`;
        return;
      }

      if (data.type === 'step') {
        const { stepIndex, totalSteps, title, status, detail } = data;
        const pct = Math.round(((stepIndex + (status === 'done' ? 1 : 0.5)) / totalSteps) * 100);
        progressBar.style.width = pct + '%';
        progressPct.textContent = pct + '%';

        const row = document.getElementById(`m-step-${stepIndex}`);
        if (row) {
          row.className = `m-step ${status}`;
          const icon = status === 'done' ? '✓' : status === 'running' ? '⚙️' : status === 'warn' ? '⚠️' : '❌';
          row.querySelector('.m-step-icon').textContent = icon;
          if (detail) {
            row.querySelector(`.m-step-detail`).textContent = detail;
          }
        }
      }
    });

    // Execute migration
    try {
      const result = await window.migrationAPI.startMigration(this.dbPath, this.choices);

      progressBar.style.width = '100%';
      progressPct.textContent = '100%';

      if (result.success) {
        this.migrationReport = result.report;
        this.backupResult = { backupPath: result.report.backupPath };
        this.populateReport(result.report, result.report.logLines || this.logLines);
        setTimeout(() => this.navigate(8), 600);
      } else {
        this._showMigrationError(result.error || 'Unknown error');
      }
    } catch (err) {
      this._showMigrationError(err.message);
    }
  },

  _logLevel(line) {
    if (line.includes('[STEP ]')) return 'STEP';
    if (line.includes('[WARN ]')) return 'WARN';
    if (line.includes('[ERROR]')) return 'ERROR';
    if (line.includes('[DEBUG]')) return 'DEBUG';
    return 'INFO';
  },

  _showMigrationError(msg) {
    const logOutput = document.getElementById('log-output');
    const errSpan = document.createElement('span');
    errSpan.className = 'log-line ERROR';
    errSpan.textContent = `[FATAL] ${msg}`;
    logOutput.appendChild(errSpan);
    logOutput.scrollTop = logOutput.scrollHeight;
  },

  // ── Screen 8: Report ─────────────────────────────────────────────────────────
  populateReport(report, logs) {
    const passed = report.validationPassed;
    const hasWarnings = (report.warnings || []).length > 0;

    const headerEl = document.getElementById('report-header');
    const cls = passed ? 'success' : hasWarnings ? 'warn' : 'error';
    headerEl.className = `report-header ${cls}`;
    headerEl.innerHTML = `
      <span class="report-icon">${passed ? '✅' : hasWarnings ? '⚠️' : '❌'}</span>
      <div>
        <div class="report-title ${cls}">${passed ? 'Migration Successful' : 'Migration Completed with Warnings'}</div>
        <div class="report-sub">Completed in ${((report.durationMs || 0) / 1000).toFixed(1)}s</div>
      </div>
    `;

    const grid = document.getElementById('report-grid');
    const tiles = [
      { value: report.sessionsConverted || 0,         label: 'Sessions Converted', color: 'var(--info)' },
      { value: report.snapshotsCreated || 0,          label: 'Snapshots Created',  color: 'var(--accent)' },
      { value: report.salaryConflictsResolved || 0,   label: 'Conflicts Resolved', color: 'var(--warn)' },
      { value: report.migrationsRecorded || 0,        label: 'Versions Recorded',  color: 'var(--success)' },
      { value: (report.warnings || []).length,        label: 'Warnings',           color: 'var(--warn)' },
      { value: (report.errors || []).length,          label: 'Errors',             color: 'var(--error)' },
    ];
    grid.innerHTML = tiles.map(t => `
      <div class="report-tile">
        <span class="r-value" style="color:${t.color}">${t.value}</span>
        <span class="r-label">${t.label}</span>
      </div>
    `).join('');

    // Validation checks
    const valList = document.getElementById('validation-result-list');
    if (report.validationChecks && report.validationChecks.length > 0) {
      valList.innerHTML = report.validationChecks.map(c => `
        <div class="v-check ${c.passed ? 'passed' : 'failed'}">
          <span class="v-icon">${c.passed ? '✓' : '✗'}</span>
          <span>${c.name}</span>
          ${c.detail ? `<span style="margin-left:auto;font-size:11px;color:var(--text-muted)">${c.detail}</span>` : ''}
        </div>
      `).join('');
    }

    // Warnings
    const warningsCard = document.getElementById('warnings-card');
    const warningsList = document.getElementById('warnings-list');
    if (report.warnings && report.warnings.length > 0) {
      warningsCard.style.display = 'block';
      warningsList.innerHTML = report.warnings.map(w => `<li>${w}</li>`).join('');
    }

    // Store log for export
    if (logs) this.logLines = logs;
  },

  // ── Export Log ───────────────────────────────────────────────────────────────
  async exportLog() {
    const result = await window.migrationAPI.exportLog(this.logLines);
    if (result.saved) {
      alert(`Log saved to:\n${result.path}`);
    }
  },
};

// ── Bootstrap ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize screen 1 defaults when navigating to it
  const originalNavigate = App.navigate.bind(App);
  App.navigate = async function (screenIndex) {
    originalNavigate(screenIndex);

    if (screenIndex === 1) {
      await App.initSelectScreen();
    }

    if (screenIndex === 3) {
      App.populateSummary();
    }

    if (screenIndex === 5) {
      App.populatePreview();
    }
  };

  // Set initial sidebar state
  document.querySelector('.step-item[data-step="0"]').classList.add('active');
});
