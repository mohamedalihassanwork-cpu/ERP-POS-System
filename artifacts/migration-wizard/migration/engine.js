'use strict';

const { createBackup } = require('./backup');
const { Logger } = require('./logger');
const { takeSnapshot, runPostValidation, openDb } = require('./validator');
const { applySchemaChanges } = require('./steps/step1-schema');
const { convertSessions } = require('./steps/step2-sessions');
const { createSnapshots } = require('./steps/step3-snapshots');
const { assignCashierAccounts } = require('./steps/step4-accounts');
const { fixSalaryIndex } = require('./steps/step5-salary');
const { updateMigrationRegistry } = require('./steps/step6-registry');
const { repairRolePermissions } = require('./steps/step7-roles');

const TOTAL_STEPS = 11;

function yield_() {
  return new Promise(resolve => setImmediate(resolve));
}

/**
 * Main migration orchestrator.
 * Uses @libsql/client for all database operations (no native compilation).
 *
 * @param {string}   dbPath     — Absolute path to the SQLite database
 * @param {object}   choices    — Operator decisions from the wizard
 * @param {function} onProgress — Progress callback
 */
async function runMigration(dbPath, choices, onProgress) {
  const startTime = Date.now();
  const logLines = [];

  const logger = new Logger(({ line }) => {
    logLines.push(line);
    onProgress({ type: 'log', line });
  });

  const progress = async (stepIndex, title, status = 'running', detail = '') => {
    onProgress({ type: 'step', stepIndex, totalSteps: TOTAL_STEPS, title, status, detail });
    await yield_();
  };

  const report = {
    startTime,
    endTime: null,
    durationMs: 0,
    backupPath: null,
    steps: [],
    sessionsConverted: 0,
    snapshotsCreated: 0,
    salaryConflictsResolved: 0,
    migrationsRecorded: 0,
    validationPassed: false,
    validationChecks: [],
    warnings: [],
    errors: [],
  };

  // ── Step 0: Pre-migration snapshot ─────────────────────────────────────────
  await progress(0, 'Taking pre-migration snapshot...');
  logger.step('Taking pre-migration snapshot...');
  const preSnapshot = await takeSnapshot(dbPath);
  logger.info(`Snapshot: invoices=${preSnapshot.counts.invoices}, transactions=${preSnapshot.counts.treasury_transactions}, treasury=${preSnapshot.balances.totalTreasury} EGP`);
  report.steps.push({ step: 0, name: 'Pre-migration snapshot', status: 'done' });
  await progress(0, 'Pre-migration snapshot complete', 'done');

  // ── Step 1: Backup ─────────────────────────────────────────────────────────
  await progress(1, 'Creating database backup...');
  logger.separator();
  logger.step('Creating database backup...');

  let backup;
  try {
    backup = createBackup(dbPath);
    report.backupPath = backup.backupPath;
    logger.info(`✓ Backup: ${backup.backupPath}`);
    logger.info(`  Size: ${(backup.sizeBytes / 1024 / 1024).toFixed(2)} MB`);
    report.steps.push({ step: 1, name: 'Backup', status: 'done' });
    await progress(1, `Backup created`, 'done', backup.backupPath);
  } catch (err) {
    logger.error(`Backup failed: ${err.message}`);
    report.errors.push(`Backup failed: ${err.message}`);
    throw new Error(`Backup failed: ${err.message}`);
  }

  // ── Open database client ───────────────────────────────────────────────────
  const db = openDb(dbPath);

  try {
    // ── Step 2: Schema changes ──────────────────────────────────────────────
    await progress(2, 'Applying schema migrations v2–v6...');
    logger.separator();
    await db.execute('BEGIN TRANSACTION');
    try {
      await applySchemaChanges(db, choices, logger);
      await db.execute('COMMIT');
      report.steps.push({ step: 2, name: 'Schema migrations', status: 'done' });
      await progress(2, 'Schema migrations applied', 'done');
    } catch (err) {
      await db.execute('ROLLBACK').catch(() => {});
      logger.error(`Schema migration failed: ${err.message}`);
      report.errors.push(`Schema migration: ${err.message}`);
      throw err;
    }

    // ── Step 3: Convert treasury_sessions ──────────────────────────────────
    await progress(3, 'Converting treasury sessions → operational days...');
    logger.separator();
    await db.execute('BEGIN TRANSACTION');
    try {
      const r = await convertSessions(db, choices, logger);
      await db.execute('COMMIT');
      report.sessionsConverted = r.converted;
      report.steps.push({ step: 3, name: 'Session conversion', status: 'done' });
      await progress(3, `Converted ${r.converted} session(s)`, 'done');
    } catch (err) {
      await db.execute('ROLLBACK').catch(() => {});
      logger.error(`Session conversion failed: ${err.message}`);
      report.errors.push(`Session conversion: ${err.message}`);
      throw err;
    }

    // ── Step 4: Balance snapshots ───────────────────────────────────────────
    await progress(4, 'Creating cashier balance snapshots...');
    logger.separator();
    await db.execute('BEGIN TRANSACTION');
    try {
      const r = await createSnapshots(db, choices, logger);
      await db.execute('COMMIT');
      report.snapshotsCreated = r.created;
      report.steps.push({ step: 4, name: 'Balance snapshots', status: 'done' });
      await progress(4, `Created ${r.created} snapshot(s)`, 'done');
    } catch (err) {
      await db.execute('ROLLBACK').catch(() => {});
      logger.error(`Snapshots failed: ${err.message}`);
      report.errors.push(`Snapshots: ${err.message}`);
      throw err;
    }

    // ── Step 5: Assign cashier accounts ────────────────────────────────────
    await progress(5, 'Assigning treasury accounts to cashier users...');
    logger.separator();
    await db.execute('BEGIN TRANSACTION');
    try {
      await assignCashierAccounts(db, choices, logger);
      await db.execute('COMMIT');
      report.steps.push({ step: 5, name: 'Cashier account assignment', status: 'done' });
      await progress(5, 'Treasury accounts assigned', 'done');
    } catch (err) {
      await db.execute('ROLLBACK').catch(() => {});
      logger.error(`Account assignment failed: ${err.message}`);
      report.errors.push(`Account assignment: ${err.message}`);
      throw err;
    }

    // ── Step 6: Salary index fix ────────────────────────────────────────────
    await progress(6, 'Fixing salary_records unique index...');
    logger.separator();
    await db.execute('BEGIN TRANSACTION');
    try {
      const r = await fixSalaryIndex(db, choices, logger);
      await db.execute('COMMIT');
      report.salaryConflictsResolved = r.resolved;
      if (r.conflictsFound > 0) report.warnings.push(`${r.conflictsFound} salary conflicts auto-resolved`);
      report.steps.push({ step: 6, name: 'Salary index fix', status: 'done' });
      await progress(6, 'Salary index fixed', 'done');
    } catch (err) {
      await db.execute('ROLLBACK').catch(() => {});
      logger.error(`Salary index fix failed: ${err.message}`);
      report.errors.push(`Salary index: ${err.message}`);
      throw err;
    }

    // ── Step 7: Migration registry ──────────────────────────────────────────
    await progress(7, 'Updating migration version registry...');
    logger.separator();
    await db.execute('BEGIN TRANSACTION');
    try {
      const r = await updateMigrationRegistry(db, logger);
      await db.execute('COMMIT');
      report.migrationsRecorded = r.inserted;
      report.steps.push({ step: 7, name: 'Migration registry', status: 'done' });
      await progress(7, `Registry updated (${r.inserted} new)`, 'done');
    } catch (err) {
      await db.execute('ROLLBACK').catch(() => {});
      logger.error(`Registry update failed: ${err.message}`);
      report.errors.push(`Registry: ${err.message}`);
      throw err;
    }

    // ── Step 7: Role permissions repair ────────────────────────────────────
    await progress(7, 'Repairing system role permissions...');
    logger.separator();
    await db.execute('BEGIN TRANSACTION');
    try {
      const r = await repairRolePermissions(db, choices, logger);
      await db.execute('COMMIT');
      report.steps.push({ step: 7, name: 'Role permissions repair', status: 'done' });
      await progress(7, `Roles repaired: ${r.repaired}, unchanged: ${r.skipped}`, 'done');
    } catch (err) {
      await db.execute('ROLLBACK').catch(() => {});
      logger.warn(`Role repair failed: ${err.message} — continuing`);
      report.warnings.push(`Role repair: ${err.message}`);
      report.steps.push({ step: 7, name: 'Role permissions repair', status: 'warn' });
      await progress(7, 'Role repair failed (non-fatal)', 'warn');
    }

    // ── Step 8: FK check ───────────────────────────────────────────────────
    await progress(8, 'Running foreign key integrity check...');
    logger.separator();
    logger.step('Running PRAGMA foreign_key_check...');
    try {
      const fkRes = await db.execute('PRAGMA foreign_key_check');
      if (fkRes.rows.length > 0) {
        const msg = `${fkRes.rows.length} FK violation(s)`;
        logger.warn(`⚠️ ${msg}`);
        report.warnings.push(msg);
      } else {
        logger.info('✓ No FK violations');
      }
    } catch (err) {
      logger.warn(`FK check error: ${err.message}`);
    }
    report.steps.push({ step: 8, name: 'FK integrity check', status: 'done' });
    await progress(8, 'Integrity check complete', 'done');

    // ── Step 9: Post-migration validation ───────────────────────────────────
    await progress(9, 'Running post-migration validation...');
    logger.separator();
    logger.step('Running post-migration validation suite...');

    // Close main client before re-opening for validation
    db.close();

    const validation = await runPostValidation(dbPath, preSnapshot);
    report.validationPassed = validation.passed;
    report.validationChecks = validation.checks;

    const passedCount = (validation.checks || []).filter(c => c.passed).length;
    const failedCount = (validation.checks || []).filter(c => !c.passed).length;
    logger.info(`Validation: ${passedCount} passed, ${failedCount} failed`);

    (validation.checks || []).forEach(c => {
      if (c.passed) {
        logger.info(`  ✓ ${c.name}`);
      } else {
        logger.warn(`  ✗ ${c.name}${c.detail ? ': ' + c.detail : ''}`);
        report.warnings.push(`Validation: ${c.name}`);
      }
    });

    report.steps.push({
      step: 9,
      name: 'Post-migration validation',
      status: validation.passed ? 'done' : 'warn',
      detail: `${passedCount}/${(validation.checks || []).length} checks passed`,
    });
    await progress(9, `Validation: ${passedCount}/${(validation.checks || []).length} passed`,
      validation.passed ? 'done' : 'warn');

  } catch (err) {
    try { db.close(); } catch (_) {}
    report.endTime = Date.now();
    report.durationMs = report.endTime - startTime;
    report.logLines = logLines;
    throw err;
  }

  // ── Finalize ───────────────────────────────────────────────────────────────
  report.endTime = Date.now();
  report.durationMs = report.endTime - startTime;
  report.logLines = logLines;

  logger.separator();
  logger.info(`✅ Migration complete in ${(report.durationMs / 1000).toFixed(1)}s`);
  logger.info(`   Sessions:    ${report.sessionsConverted} converted`);
  logger.info(`   Snapshots:   ${report.snapshotsCreated} created`);
  logger.info(`   Conflicts:   ${report.salaryConflictsResolved} resolved`);
  logger.info(`   Validation:  ${report.validationPassed ? 'PASSED ✅' : 'PARTIAL ⚠️'}`);
  logger.info(`   Warnings:    ${report.warnings.length}`);
  logger.info(`   Errors:      ${report.errors.length}`);
  logger.info(`   Backup:      ${report.backupPath}`);

  return { report, logLines };
}

module.exports = { runMigration };
