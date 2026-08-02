'use strict';

async function fixSalaryIndex(db, choices, logger) {
  logger.step('Fixing salary_records unique index...');

  const idxRes = await db.execute(
    "SELECT sql FROM sqlite_master WHERE type='index' AND name='salary_records_employee_period_unique'"
  );
  const idxSql = idxRes.rows.length > 0 ? (idxRes.rows[0][0] ?? idxRes.rows[0].sql ?? '') : '';

  if (idxSql && !idxSql.includes('pay_period_type')) {
    logger.info('[Step 5] ✓ salary_records index is already correct (2-column) — skipped');
    return { conflictsFound: 0, resolved: 0 };
  }

  // Check for conflicts
  const conflictsRes = await db.execute(
    `SELECT sr.employee_id, sr.period_month, COUNT(*) as cnt,
            GROUP_CONCAT(sr.pay_period_type) as types,
            e.name as employee_name
     FROM salary_records sr
     LEFT JOIN employees e ON sr.employee_id = e.id
     GROUP BY sr.employee_id, sr.period_month
     HAVING cnt > 1`
  );
  const conflicts = conflictsRes.rows;
  let resolved = 0;

  if (conflicts.length > 0) {
    logger.warn(`[Step 5] ⚠️ ${conflicts.length} salary conflict(s) found — auto-resolving...`);
    for (const c of conflicts) {
      const ename = c[4] ?? c.employee_name ?? c[0] ?? c.employee_id;
      const month = c[1] ?? c.period_month;
      logger.warn(`  - ${ename}, month: ${month}`);
    }

    // Keep PAID record if exists, otherwise keep newest rowid
    await db.execute(`
      DELETE FROM salary_records
      WHERE rowid NOT IN (
        SELECT CASE
          WHEN MAX(CASE WHEN status='PAID' THEN rowid ELSE 0 END) > 0
          THEN MAX(CASE WHEN status='PAID' THEN rowid ELSE 0 END)
          ELSE MAX(rowid)
        END
        FROM salary_records
        GROUP BY employee_id, period_month
      )
    `);
    resolved = conflicts.length;
    logger.info(`[Step 5] ✓ Resolved ${resolved} conflict(s)`);
  } else {
    logger.info('[Step 5] ✓ No salary conflicts — safe to proceed');
  }

  // Drop old 3-column index
  try {
    await db.execute(`DROP INDEX IF EXISTS salary_records_employee_period_unique`);
    logger.info('[Step 5] ✓ Dropped old 3-column unique index');
  } catch (err) {
    logger.warn(`[Step 5] Could not drop old index: ${err.message}`);
  }

  // Create correct 2-column index
  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS salary_records_employee_period_unique
    ON salary_records (employee_id, period_month)
  `);
  logger.info('[Step 5] ✓ Created correct 2-column index (employee_id, period_month)');
  logger.info('[Step 5] ✅ Salary index fix complete');

  return { conflictsFound: conflicts.length, resolved };
}

module.exports = { fixSalaryIndex };
