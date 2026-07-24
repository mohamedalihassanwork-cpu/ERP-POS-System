import { Router, type IRouter, type Request } from "express";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import {
  db,
  expenseCategoriesTable,
  expensesTable,
  employeesTable,
  employeeAdvancesTable,
  salaryRecordsTable,
  equityMovementsTable,
  treasuryAccountsTable,
} from "@workspace/db";
import {
  ListExpenseCategoriesQueryParams,
  CreateExpenseCategoryBody,
  UpdateExpenseCategoryBody,
  ListExpensesQueryParams,
  CreateExpenseBody,
  ListEmployeesQueryParams,
  CreateEmployeeBody,
  UpdateEmployeeBody,
  ListAdvancesQueryParams,
  CreateAdvanceBody,
  ListSalariesQueryParams,
  CreateSalaryBody,
  PaySalaryBody,
  ListEquityMovementsQueryParams,
  CreateEquityMovementBody,
} from "@workspace/api-zod";
import { writeAuditLog } from "../lib/audit";
import { ensureStoreFinancials, TREASURY_TYPE_TO_ACCOUNT_CODE } from "../lib/seed";
import { postTreasuryTransaction, resolveBackdatedTreasuryAccount } from "../lib/treasury";
import { postJournalEntry } from "../lib/accounting";
import { money, toNum } from "../lib/money";
import { requireAuth, requirePermission, requireAnyPermission } from "../middleware/auth";

const router: IRouter = Router();

function clientIp(req: Request): string | null {
  return req.ip ?? null;
}

function iso(d: Date): string {
  return d.toISOString();
}

// DB date columns (PgDateString) expect "YYYY-MM-DD"; the generated Zod schemas
// coerce date strings into Date objects, so normalise back before persisting.
function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Expense Categories ──────────────────────────────────────────────────────

router.get(
  "/finance/expense-categories",
  requireAuth,
  requireAnyPermission(["finance.view", "expenses.create"]),
  async (req, res) => {
    const parsed = ListExpenseCategoriesQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const includeInactive = parsed.data.includeInactive ?? false;
    const where = includeInactive
      ? eq(expenseCategoriesTable.storeId, storeId)
      : and(
          eq(expenseCategoriesTable.storeId, storeId),
          eq(expenseCategoriesTable.isActive, true),
        );
    const rows = await db
      .select({
        id: expenseCategoriesTable.id,
        name: expenseCategoriesTable.name,
        isActive: expenseCategoriesTable.isActive,
        createdAt: expenseCategoriesTable.createdAt,
      })
      .from(expenseCategoriesTable)
      .where(where)
      .orderBy(expenseCategoriesTable.name);
    res.json(rows.map((r) => ({ ...r, createdAt: iso(r.createdAt) })));
  },
);

router.post(
  "/finance/expense-categories",
  requireAuth,
  requirePermission("finance.manage"),
  async (req, res) => {
    const parsed = CreateExpenseCategoryBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const existing = await db
      .select({ id: expenseCategoriesTable.id })
      .from(expenseCategoriesTable)
      .where(
        and(
          eq(expenseCategoriesTable.storeId, storeId),
          eq(expenseCategoriesTable.name, parsed.data.name),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "التصنيف موجود بالفعل" });
      return;
    }
    const [row] = await db
      .insert(expenseCategoriesTable)
      .values({ storeId, name: parsed.data.name })
      .returning({
        id: expenseCategoriesTable.id,
        name: expenseCategoriesTable.name,
        isActive: expenseCategoriesTable.isActive,
        createdAt: expenseCategoriesTable.createdAt,
      });
    await writeAuditLog({
      storeId,
      userId: req.auth!.userId,
      action: "expense_category.create",
      entityType: "expense_category",
      entityId: row.id,
      newValue: { name: row.name },
      ipAddress: clientIp(req),
    });
    res.status(201).json({ ...row, createdAt: iso(row.createdAt) });
  },
);

router.patch(
  "/finance/expense-categories/:id",
  requireAuth,
  requirePermission("finance.manage"),
  async (req, res) => {
    const parsed = UpdateExpenseCategoryBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const id = String(req.params["id"]);
    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updates["name"] = parsed.data.name;
    if (parsed.data.isActive !== undefined) updates["isActive"] = parsed.data.isActive;
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "لا توجد تغييرات" });
      return;
    }
    const [row] = await db
      .update(expenseCategoriesTable)
      .set(updates)
      .where(and(eq(expenseCategoriesTable.id, id), eq(expenseCategoriesTable.storeId, storeId)))
      .returning({
        id: expenseCategoriesTable.id,
        name: expenseCategoriesTable.name,
        isActive: expenseCategoriesTable.isActive,
        createdAt: expenseCategoriesTable.createdAt,
      });
    if (!row) {
      res.status(404).json({ error: "التصنيف غير موجود" });
      return;
    }
    await writeAuditLog({
      storeId,
      userId: req.auth!.userId,
      action: "expense_category.update",
      entityType: "expense_category",
      entityId: row.id,
      newValue: updates,
      ipAddress: clientIp(req),
    });
    res.json({ ...row, createdAt: iso(row.createdAt) });
  },
);

router.delete(
  "/finance/expense-categories/:id",
  requireAuth,
  requirePermission("finance.manage"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const id = String(req.params["id"]);
    const [row] = await db
      .update(expenseCategoriesTable)
      .set({ isActive: false })
      .where(and(eq(expenseCategoriesTable.id, id), eq(expenseCategoriesTable.storeId, storeId)))
      .returning({ id: expenseCategoriesTable.id });
    if (!row) {
      res.status(404).json({ error: "التصنيف غير موجود" });
      return;
    }
    await writeAuditLog({
      storeId,
      userId: req.auth!.userId,
      action: "expense_category.delete",
      entityType: "expense_category",
      entityId: row.id,
      ipAddress: clientIp(req),
    });
    res.status(204).end();
  },
);

// ── Expenses ────────────────────────────────────────────────────────────────

router.get(
  "/finance/expenses",
  requireAuth,
  requireAnyPermission(["finance.view", "expenses.create"]),
  async (req, res) => {
  const parsed = ListExpensesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
    return;
  }
  const storeId = req.auth!.storeId;
  const { page = 1, pageSize = 20, categoryId, fromDate, toDate } = parsed.data;

  const conds = [eq(expensesTable.storeId, storeId)];
  if (categoryId) conds.push(eq(expensesTable.categoryId, categoryId));
  if (fromDate) conds.push(gte(expensesTable.expenseDate, dateStr(fromDate)));
  if (toDate) conds.push(lte(expensesTable.expenseDate, dateStr(toDate)));
  const where = and(...conds);

  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(expensesTable)
    .where(where);

  const rows = await db
    .select({
      id: expensesTable.id,
      categoryId: expensesTable.categoryId,
      categoryName: expenseCategoriesTable.name,
      amount: expensesTable.amount,
      expenseDate: expensesTable.expenseDate,
      description: expensesTable.description,
      treasuryAccountId: expensesTable.treasuryAccountId,
      recordedBy: expensesTable.recordedBy,
      createdAt: expensesTable.createdAt,
    })
    .from(expensesTable)
    .leftJoin(expenseCategoriesTable, eq(expenseCategoriesTable.id, expensesTable.categoryId))
    .where(where)
    .orderBy(desc(expensesTable.expenseDate), desc(expensesTable.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  res.json({
    items: rows.map((r) => ({ ...r, createdAt: iso(r.createdAt) })),
    total: count,
    page,
    pageSize,
  });
});

router.post(
  "/finance/expenses",
  requireAuth,
  requireAnyPermission(["finance.manage", "expenses.create"]),
  async (req, res) => {
    const parsed = CreateExpenseBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;
    const { categoryId, amount, expenseDate, treasuryAccountId, description } = parsed.data;

    await ensureStoreFinancials(db, storeId);

    let expenseId: string;
    try {
      expenseId = await db.transaction(async (tx) => {
        const [category] = await tx
          .select({ id: expenseCategoriesTable.id })
          .from(expenseCategoriesTable)
          .where(
            and(eq(expenseCategoriesTable.id, categoryId), eq(expenseCategoriesTable.storeId, storeId)),
          )
          .limit(1);
        if (!category) throw new Error("CATEGORY_NOT_FOUND");

        const effectiveTreasuryId = await resolveBackdatedTreasuryAccount(tx, storeId, treasuryAccountId, expenseDate, req.auth!.permissions);

        const [drawer] = await tx
          .select({ id: treasuryAccountsTable.id, type: treasuryAccountsTable.type })
          .from(treasuryAccountsTable)
          .where(
            and(
              eq(treasuryAccountsTable.id, effectiveTreasuryId),
              eq(treasuryAccountsTable.storeId, storeId),
            ),
          )
          .limit(1);
        if (!drawer) throw new Error("TREASURY_ACCOUNT_NOT_FOUND");

        const [exp] = await tx
          .insert(expensesTable)
          .values({
            storeId,
            categoryId,
            amount: money(amount),
            expenseDate: dateStr(expenseDate),
            description: description ?? null,
            treasuryAccountId: drawer.id,
            recordedBy: userId,
          })
          .returning({ id: expensesTable.id });

        await postTreasuryTransaction(tx, {
          storeId,
          treasuryAccountId: drawer.id,
          direction: "OUT",
          amount,
          referenceType: "EXPENSE",
          referenceId: exp.id,
          description: description ?? "مصروف",
          userId,
        });

        await postJournalEntry(tx, {
          storeId,
          userId,
          description: description ?? "مصروف تشغيلي",
          referenceType: "EXPENSE",
          referenceId: exp.id,
          lines: [
            { code: "5100", debit: amount },
            { code: TREASURY_TYPE_TO_ACCOUNT_CODE[drawer.type], credit: amount },
          ],
        });

        return exp.id;
      });
    } catch (err) {
      if (err instanceof Error && err.message === "UNAUTHORIZED_MAIN_SAFE") {
        res.status(403).json({ error: "ليس لديك صلاحية لاستخدام الخزينة الرئيسية (أو لعمليات بأثر رجعي)" });
        return;
      }
      if (err instanceof Error && err.message === "CATEGORY_NOT_FOUND") {
        res.status(404).json({ error: "التصنيف غير موجود" });
        return;
      }
      if (err instanceof Error && err.message === "TREASURY_ACCOUNT_NOT_FOUND") {
        res.status(404).json({ error: "حساب الخزينة غير موجود" });
        return;
      }
      if (err instanceof Error && err.message === "INSUFFICIENT_TREASURY") {
        res.status(400).json({ error: "رصيد الخزينة غير كافٍ" });
        return;
      }
      throw err;
    }

    await writeAuditLog({
      storeId,
      userId,
      action: "expense.create",
      entityType: "expense",
      entityId: expenseId,
      newValue: { amount, categoryId, treasuryAccountId },
      ipAddress: clientIp(req),
    });

    const [row] = await db
      .select({
        id: expensesTable.id,
        categoryId: expensesTable.categoryId,
        categoryName: expenseCategoriesTable.name,
        amount: expensesTable.amount,
        expenseDate: expensesTable.expenseDate,
        description: expensesTable.description,
        treasuryAccountId: expensesTable.treasuryAccountId,
        recordedBy: expensesTable.recordedBy,
        createdAt: expensesTable.createdAt,
      })
      .from(expensesTable)
      .leftJoin(expenseCategoriesTable, eq(expenseCategoriesTable.id, expensesTable.categoryId))
      .where(eq(expensesTable.id, expenseId))
      .limit(1);

    res.status(201).json({ ...row, createdAt: iso(row.createdAt) });
  },
);

// ── Employees ───────────────────────────────────────────────────────────────

const employeeColumns = {
  id: employeesTable.id,
  userId: employeesTable.userId,
  name: employeesTable.name,
  phone: employeesTable.phone,
  jobTitle: employeesTable.jobTitle,
  monthlySalary: employeesTable.monthlySalary,
  advanceBalance: employeesTable.advanceBalance,
  isActive: employeesTable.isActive,
  createdAt: employeesTable.createdAt,
};

router.get("/finance/employees", requireAuth, requirePermission("finance.view"), async (req, res) => {
  const parsed = ListEmployeesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
    return;
  }
  const storeId = req.auth!.storeId;
  const includeInactive = parsed.data.includeInactive ?? false;
  const where = includeInactive
    ? eq(employeesTable.storeId, storeId)
    : and(eq(employeesTable.storeId, storeId), eq(employeesTable.isActive, true));
  const rows = await db
    .select(employeeColumns)
    .from(employeesTable)
    .where(where)
    .orderBy(employeesTable.name);
  res.json(rows.map((r) => ({ ...r, createdAt: iso(r.createdAt) })));
});

router.post(
  "/finance/employees",
  requireAuth,
  requirePermission("finance.manage"),
  async (req, res) => {
    const parsed = CreateEmployeeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const { name, phone, jobTitle, monthlySalary, userId } = parsed.data;
    const [row] = await db
      .insert(employeesTable)
      .values({
        storeId,
        name,
        phone: phone ?? null,
        jobTitle: jobTitle ?? null,
        monthlySalary: money(monthlySalary ?? 0),
        userId: userId ?? null,
      })
      .returning(employeeColumns);
    await writeAuditLog({
      storeId,
      userId: req.auth!.userId,
      action: "employee.create",
      entityType: "employee",
      entityId: row.id,
      newValue: { name },
      ipAddress: clientIp(req),
    });
    res.status(201).json({ ...row, createdAt: iso(row.createdAt) });
  },
);

router.patch(
  "/finance/employees/:id",
  requireAuth,
  requirePermission("finance.manage"),
  async (req, res) => {
    const parsed = UpdateEmployeeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const id = String(req.params["id"]);
    const d = parsed.data;
    const updates: Record<string, unknown> = {};
    if (d.name !== undefined) updates["name"] = d.name;
    if (d.phone !== undefined) updates["phone"] = d.phone;
    if (d.jobTitle !== undefined) updates["jobTitle"] = d.jobTitle;
    if (d.monthlySalary !== undefined) updates["monthlySalary"] = money(d.monthlySalary);
    if (d.isActive !== undefined) updates["isActive"] = d.isActive;
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "لا توجد تغييرات" });
      return;
    }
    const [row] = await db
      .update(employeesTable)
      .set(updates)
      .where(and(eq(employeesTable.id, id), eq(employeesTable.storeId, storeId)))
      .returning(employeeColumns);
    if (!row) {
      res.status(404).json({ error: "الموظف غير موجود" });
      return;
    }
    await writeAuditLog({
      storeId,
      userId: req.auth!.userId,
      action: "employee.update",
      entityType: "employee",
      entityId: row.id,
      newValue: updates,
      ipAddress: clientIp(req),
    });
    res.json({ ...row, createdAt: iso(row.createdAt) });
  },
);

router.delete(
  "/finance/employees/:id",
  requireAuth,
  requirePermission("finance.manage"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const id = String(req.params["id"]);
    const [row] = await db
      .update(employeesTable)
      .set({ isActive: false })
      .where(and(eq(employeesTable.id, id), eq(employeesTable.storeId, storeId)))
      .returning({ id: employeesTable.id });
    if (!row) {
      res.status(404).json({ error: "الموظف غير موجود" });
      return;
    }
    await writeAuditLog({
      storeId,
      userId: req.auth!.userId,
      action: "employee.delete",
      entityType: "employee",
      entityId: row.id,
      ipAddress: clientIp(req),
    });
    res.status(204).end();
  },
);

// ── Employee Advances ───────────────────────────────────────────────────────

router.get("/finance/advances", requireAuth, requirePermission("finance.view"), async (req, res) => {
  const parsed = ListAdvancesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
    return;
  }
  const storeId = req.auth!.storeId;
  const { page = 1, pageSize = 20, employeeId } = parsed.data;
  const conds = [eq(employeeAdvancesTable.storeId, storeId)];
  if (employeeId) conds.push(eq(employeeAdvancesTable.employeeId, employeeId));
  const where = and(...conds);

  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(employeeAdvancesTable)
    .where(where);

  const rows = await db
    .select({
      id: employeeAdvancesTable.id,
      employeeId: employeeAdvancesTable.employeeId,
      employeeName: employeesTable.name,
      amount: employeeAdvancesTable.amount,
      advanceDate: employeeAdvancesTable.advanceDate,
      notes: employeeAdvancesTable.notes,
      treasuryAccountId: employeeAdvancesTable.treasuryAccountId,
      createdAt: employeeAdvancesTable.createdAt,
    })
    .from(employeeAdvancesTable)
    .leftJoin(employeesTable, eq(employeesTable.id, employeeAdvancesTable.employeeId))
    .where(where)
    .orderBy(desc(employeeAdvancesTable.advanceDate), desc(employeeAdvancesTable.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  res.json({
    items: rows.map((r) => ({ ...r, createdAt: iso(r.createdAt) })),
    total: count,
    page,
    pageSize,
  });
});

router.post(
  "/finance/advances",
  requireAuth,
  requirePermission("finance.manage"),
  async (req, res) => {
    const parsed = CreateAdvanceBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;
    const { employeeId, amount, advanceDate, treasuryAccountId, notes } = parsed.data;

    await ensureStoreFinancials(db, storeId);

    let advanceId: string;
    try {
      advanceId = await db.transaction(async (tx) => {
        const [employee] = await tx
          .select({ id: employeesTable.id, advanceBalance: employeesTable.advanceBalance })
          .from(employeesTable)
          .where(and(eq(employeesTable.id, employeeId), eq(employeesTable.storeId, storeId)))
          
          .limit(1);
        if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");

        const effectiveTreasuryId = await resolveBackdatedTreasuryAccount(tx, storeId, treasuryAccountId, advanceDate, req.auth!.permissions);

        const [drawer] = await tx
          .select({ id: treasuryAccountsTable.id, type: treasuryAccountsTable.type })
          .from(treasuryAccountsTable)
          .where(
            and(
              eq(treasuryAccountsTable.id, effectiveTreasuryId),
              eq(treasuryAccountsTable.storeId, storeId),
            ),
          )
          .limit(1);
        if (!drawer) throw new Error("TREASURY_ACCOUNT_NOT_FOUND");

        const [adv] = await tx
          .insert(employeeAdvancesTable)
          .values({
            storeId,
            employeeId,
            amount: money(amount),
            advanceDate: dateStr(advanceDate),
            notes: notes ?? null,
            treasuryAccountId: drawer.id,
            createdBy: userId,
          })
          .returning({ id: employeeAdvancesTable.id });

        await tx
          .update(employeesTable)
          .set({ advanceBalance: money(toNum(employee.advanceBalance) + amount) })
          .where(eq(employeesTable.id, employee.id));

        await postTreasuryTransaction(tx, {
          storeId,
          treasuryAccountId: drawer.id,
          direction: "OUT",
          amount,
          referenceType: "SALARY",
          referenceId: adv.id,
          description: notes ?? "سلفة موظف",
          userId,
        });

        await postJournalEntry(tx, {
          storeId,
          userId,
          description: notes ?? "سلفة موظف",
          referenceType: "SALARY",
          referenceId: adv.id,
          lines: [
            { code: "1300", debit: amount },
            { code: TREASURY_TYPE_TO_ACCOUNT_CODE[drawer.type], credit: amount },
          ],
        });

        return adv.id;
      });
    } catch (err) {
      if (err instanceof Error && err.message === "UNAUTHORIZED_MAIN_SAFE") {
        res.status(403).json({ error: "ليس لديك صلاحية لاستخدام الخزينة الرئيسية (أو لعمليات بأثر رجعي)" });
        return;
      }
      if (err instanceof Error && err.message === "EMPLOYEE_NOT_FOUND") {
        res.status(404).json({ error: "الموظف غير موجود" });
        return;
      }
      if (err instanceof Error && err.message === "TREASURY_ACCOUNT_NOT_FOUND") {
        res.status(404).json({ error: "حساب الخزينة غير موجود" });
        return;
      }
      if (err instanceof Error && err.message === "INSUFFICIENT_TREASURY") {
        res.status(400).json({ error: "رصيد الخزينة غير كافٍ" });
        return;
      }
      throw err;
    }

    await writeAuditLog({
      storeId,
      userId,
      action: "advance.create",
      entityType: "employee_advance",
      entityId: advanceId,
      newValue: { employeeId, amount },
      ipAddress: clientIp(req),
    });

    const [row] = await db
      .select({
        id: employeeAdvancesTable.id,
        employeeId: employeeAdvancesTable.employeeId,
        employeeName: employeesTable.name,
        amount: employeeAdvancesTable.amount,
        advanceDate: employeeAdvancesTable.advanceDate,
        notes: employeeAdvancesTable.notes,
        treasuryAccountId: employeeAdvancesTable.treasuryAccountId,
        createdAt: employeeAdvancesTable.createdAt,
      })
      .from(employeeAdvancesTable)
      .leftJoin(employeesTable, eq(employeesTable.id, employeeAdvancesTable.employeeId))
      .where(eq(employeeAdvancesTable.id, advanceId))
      .limit(1);

    res.status(201).json({ ...row, createdAt: iso(row.createdAt) });
  },
);

// ── Salary Records ──────────────────────────────────────────────────────────

const salaryColumns = {
  id: salaryRecordsTable.id,
  employeeId: salaryRecordsTable.employeeId,
  employeeName: employeesTable.name,
  periodMonth: salaryRecordsTable.periodMonth,
  payPeriodType: salaryRecordsTable.payPeriodType,
  baseSalary: salaryRecordsTable.baseSalary,
  advanceDeduction: salaryRecordsTable.advanceDeduction,
  otherDeductions: salaryRecordsTable.otherDeductions,
  deductions: salaryRecordsTable.deductions,
  bonuses: salaryRecordsTable.bonuses,
  netAmount: salaryRecordsTable.netAmount,
  status: salaryRecordsTable.status,
  treasuryAccountId: salaryRecordsTable.treasuryAccountId,
  paidAt: salaryRecordsTable.paidAt,
  createdAt: salaryRecordsTable.createdAt,
};

function serializeSalary<
  T extends { paidAt: Date | null; createdAt: Date },
>(r: T) {
  return { ...r, paidAt: r.paidAt ? iso(r.paidAt) : null, createdAt: iso(r.createdAt) };
}

router.get("/finance/salaries", requireAuth, requirePermission("finance.view"), async (req, res) => {
  const parsed = ListSalariesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
    return;
  }
  const storeId = req.auth!.storeId;
  const { page = 1, pageSize = 20, employeeId, periodMonth, status } = parsed.data;
  const conds = [eq(salaryRecordsTable.storeId, storeId)];
  if (employeeId) conds.push(eq(salaryRecordsTable.employeeId, employeeId));
  if (periodMonth) conds.push(eq(salaryRecordsTable.periodMonth, periodMonth));
  if (status) conds.push(eq(salaryRecordsTable.status, status));
  const where = and(...conds);

  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(salaryRecordsTable)
    .where(where);

  const rows = await db
    .select(salaryColumns)
    .from(salaryRecordsTable)
    .leftJoin(employeesTable, eq(employeesTable.id, salaryRecordsTable.employeeId))
    .where(where)
    .orderBy(desc(salaryRecordsTable.periodMonth), desc(salaryRecordsTable.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  res.json({ items: rows.map(serializeSalary), total: count, page, pageSize });
});

router.post(
  "/finance/salaries",
  requireAuth,
  requirePermission("finance.manage"),
  async (req, res) => {
    const parsed = CreateSalaryBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;
    const { employeeId, periodMonth, payPeriodType } = parsed.data;
    const bonuses = parsed.data.bonuses ?? 0;
    const otherDeductions = parsed.data.otherDeductions ?? 0;

    await ensureStoreFinancials(db, storeId);

    let salaryId: string;
    try {
      salaryId = await db.transaction(async (tx) => {
        const [employee] = await tx
          .select({
            id: employeesTable.id,
            monthlySalary: employeesTable.monthlySalary,
            advanceBalance: employeesTable.advanceBalance,
          })
          .from(employeesTable)
          .where(and(eq(employeesTable.id, employeeId), eq(employeesTable.storeId, storeId)))
          .limit(1);
        if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");

        let calculatedBaseSalary = toNum(employee.monthlySalary);
        const type = payPeriodType ?? "MONTHLY";
        if (type === "WEEKLY") {
            calculatedBaseSalary = calculatedBaseSalary / 4;
        } else if (type === "DAILY") {
            calculatedBaseSalary = calculatedBaseSalary / 30;
        }

        const baseSalary =
          parsed.data.baseSalary !== undefined
            ? parsed.data.baseSalary
            : calculatedBaseSalary;

        const maxDeductible = Math.max(0, baseSalary + bonuses - otherDeductions);
        let autoAdvanceDeduction = 0;
        if (toNum(employee.advanceBalance) > 0) {
          autoAdvanceDeduction = Math.min(toNum(employee.advanceBalance), maxDeductible);
        }

        const advanceDeduction = parsed.data.advanceDeduction !== undefined 
          ? parsed.data.advanceDeduction 
          : autoAdvanceDeduction;

        const totalDeductions = advanceDeduction + otherDeductions;

        // Only advance deduction is constrained by the advance balance.
        if (advanceDeduction > toNum(employee.advanceBalance)) {
          throw new Error("DEDUCTIONS_EXCEED_ADVANCE");
        }

        const gross = baseSalary + bonuses;
        const netAmount = gross - totalDeductions;
        if (netAmount < 0) throw new Error("NEGATIVE_NET");

        const existing = await tx
          .select({ id: salaryRecordsTable.id })
          .from(salaryRecordsTable)
          .where(
            and(
              eq(salaryRecordsTable.employeeId, employeeId),
              eq(salaryRecordsTable.periodMonth, periodMonth),
              eq(salaryRecordsTable.payPeriodType, payPeriodType ?? "MONTHLY"),
            ),
          )
          .limit(1);
        if (existing.length > 0) throw new Error("DUPLICATE_PERIOD");

        const [rec] = await tx
          .insert(salaryRecordsTable)
          .values({
            storeId,
            employeeId,
            periodMonth,
            payPeriodType: payPeriodType ?? "MONTHLY",
            baseSalary: money(baseSalary),
            advanceDeduction: money(advanceDeduction),
            otherDeductions: money(otherDeductions),
            deductions: money(totalDeductions),
            bonuses: money(bonuses),
            netAmount: money(netAmount),
            status: "PENDING",
            createdBy: userId,
          })
          .returning({ id: salaryRecordsTable.id });

        // Accrue expense and payable (no cash yet).
        await postJournalEntry(tx, {
          storeId,
          userId,
          description: `استحقاق راتب ${periodMonth}`,
          referenceType: "SALARY",
          referenceId: rec.id,
          lines: [
            { code: "5200", debit: gross },
            { code: "2100", credit: gross },
          ],
        });

        return rec.id;
      });
    } catch (err) {
      if (err instanceof Error && err.message === "EMPLOYEE_NOT_FOUND") {
        res.status(404).json({ error: "الموظف غير موجود" });
        return;
      }
      if (err instanceof Error && err.message === "DEDUCTIONS_EXCEED_ADVANCE") {
        res.status(400).json({ error: "استقطاع السلفة يتجاوز رصيد سلفة الموظف" });
        return;
      }
      if (err instanceof Error && err.message === "NEGATIVE_NET") {
        res.status(400).json({ error: "صافي الراتب لا يمكن أن يكون سالباً" });
        return;
      }
      if (err instanceof Error && err.message === "DUPLICATE_PERIOD") {
        res.status(409).json({ error: "يوجد راتب لهذا الموظف عن نفس الفترة" });
        return;
      }
      if (err instanceof Error && err.message === "EMPTY_JOURNAL") {
        res.status(400).json({ error: "إجمالي الراتب لا يمكن أن يكون صفراً" });
        return;
      }
      throw err;
    }

    await writeAuditLog({
      storeId,
      userId,
      action: "salary.create",
      entityType: "salary_record",
      entityId: salaryId,
      newValue: { employeeId, periodMonth, payPeriodType },
      ipAddress: clientIp(req),
    });

    const [row] = await db
      .select(salaryColumns)
      .from(salaryRecordsTable)
      .leftJoin(employeesTable, eq(employeesTable.id, salaryRecordsTable.employeeId))
      .where(eq(salaryRecordsTable.id, salaryId))
      .limit(1);

    res.status(201).json(serializeSalary(row));
  },
);

router.post(
  "/finance/salaries/:id/pay",
  requireAuth,
  requirePermission("finance.manage"),
  async (req, res) => {
    const parsed = PaySalaryBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;
    const id = String(req.params["id"]);
    const { treasuryAccountId } = parsed.data;

    await ensureStoreFinancials(db, storeId);

    try {
      await db.transaction(async (tx) => {
        const [rec] = await tx
          .select({
            id: salaryRecordsTable.id,
            employeeId: salaryRecordsTable.employeeId,
            periodMonth: salaryRecordsTable.periodMonth,
            baseSalary: salaryRecordsTable.baseSalary,
            bonuses: salaryRecordsTable.bonuses,
            advanceDeduction: salaryRecordsTable.advanceDeduction,
            otherDeductions: salaryRecordsTable.otherDeductions,
            netAmount: salaryRecordsTable.netAmount,
            status: salaryRecordsTable.status,
          })
          .from(salaryRecordsTable)
          .where(and(eq(salaryRecordsTable.id, id), eq(salaryRecordsTable.storeId, storeId)))
          .limit(1);
        if (!rec) throw new Error("SALARY_NOT_FOUND");
        if (rec.status === "PAID") throw new Error("ALREADY_PAID");

        const [drawer] = await tx
          .select({ id: treasuryAccountsTable.id, type: treasuryAccountsTable.type })
          .from(treasuryAccountsTable)
          .where(
            and(
              eq(treasuryAccountsTable.id, treasuryAccountId),
              eq(treasuryAccountsTable.storeId, storeId),
            ),
          )
          .limit(1);
        if (!drawer) throw new Error("TREASURY_ACCOUNT_NOT_FOUND");

        const gross = toNum(rec.baseSalary) + toNum(rec.bonuses);
        const advanceDeduction = toNum(rec.advanceDeduction);
        const otherDeductions = toNum(rec.otherDeductions);
        const net = toNum(rec.netAmount);

        await postTreasuryTransaction(tx, {
          storeId,
          treasuryAccountId: drawer.id,
          direction: "OUT",
          amount: net,
          referenceType: "SALARY",
          referenceId: rec.id,
          description: `دفع راتب ${rec.periodMonth}`,
          userId,
        });

        const lines = [
          { code: "2100", debit: gross },
          { code: TREASURY_TYPE_TO_ACCOUNT_CODE[drawer.type], credit: net },
        ];
        
        if (advanceDeduction > 0) {
          lines.push({ code: "1300", credit: advanceDeduction });
          await tx
            .update(employeesTable)
            .set({
              advanceBalance: sql`${employeesTable.advanceBalance} - ${money(advanceDeduction)}`,
            })
            .where(eq(employeesTable.id, rec.employeeId));
        }

        if (otherDeductions > 0) {
          // Disciplinary/absence deductions reduce the recognized salary expense
          lines.push({ code: "5200", credit: otherDeductions });
        }

        await postJournalEntry(tx, {
          storeId,
          userId,
          description: `دفع راتب ${rec.periodMonth}`,
          referenceType: "SALARY",
          referenceId: rec.id,
          lines,
        });

        await tx
          .update(salaryRecordsTable)
          .set({ status: "PAID", paidAt: new Date(), treasuryAccountId: drawer.id })
          .where(eq(salaryRecordsTable.id, rec.id));
      });
    } catch (err) {
      if (err instanceof Error && err.message === "SALARY_NOT_FOUND") {
        res.status(404).json({ error: "سجل الراتب غير موجود" });
        return;
      }
      if (err instanceof Error && err.message === "ALREADY_PAID") {
        res.status(400).json({ error: "تم دفع هذا الراتب بالفعل" });
        return;
      }
      if (err instanceof Error && err.message === "TREASURY_ACCOUNT_NOT_FOUND") {
        res.status(404).json({ error: "حساب الخزينة غير موجود" });
        return;
      }
      if (err instanceof Error && err.message === "INSUFFICIENT_TREASURY") {
        res.status(400).json({ error: "رصيد الخزينة غير كافٍ" });
        return;
      }
      throw err;
    }

    await writeAuditLog({
      storeId,
      userId,
      action: "salary.pay",
      entityType: "salary_record",
      entityId: id,
      newValue: { treasuryAccountId },
      ipAddress: clientIp(req),
    });

    const [row] = await db
      .select(salaryColumns)
      .from(salaryRecordsTable)
      .leftJoin(employeesTable, eq(employeesTable.id, salaryRecordsTable.employeeId))
      .where(eq(salaryRecordsTable.id, id))
      .limit(1);

    res.json(serializeSalary(row));
  },
);

// ── Equity Movements (owner withdrawals / capital deposits) ─────────────────

router.get(
  "/finance/equity-movements",
  requireAuth,
  requirePermission("finance.view"),
  async (req, res) => {
    const parsed = ListEquityMovementsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const { page = 1, pageSize = 20, type } = parsed.data;
    const conds = [eq(equityMovementsTable.storeId, storeId)];
    if (type) conds.push(eq(equityMovementsTable.type, type));
    const where = and(...conds);

    const [{ count }] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(equityMovementsTable)
      .where(where);

    const rows = await db
      .select({
        id: equityMovementsTable.id,
        type: equityMovementsTable.type,
        amount: equityMovementsTable.amount,
        movementDate: equityMovementsTable.movementDate,
        description: equityMovementsTable.description,
        treasuryAccountId: equityMovementsTable.treasuryAccountId,
        createdAt: equityMovementsTable.createdAt,
      })
      .from(equityMovementsTable)
      .where(where)
      .orderBy(desc(equityMovementsTable.movementDate), desc(equityMovementsTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    res.json({
      items: rows.map((r) => ({ ...r, createdAt: iso(r.createdAt) })),
      total: count,
      page,
      pageSize,
    });
  },
);

router.post(
  "/finance/equity-movements",
  requireAuth,
  requirePermission("finance.manage"),
  async (req, res) => {
    const parsed = CreateEquityMovementBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;
    const { type, amount, movementDate, treasuryAccountId, description } = parsed.data;

    await ensureStoreFinancials(db, storeId);

    let movementId: string;
    try {
      movementId = await db.transaction(async (tx) => {
        const effectiveTreasuryId = await resolveBackdatedTreasuryAccount(tx, storeId, treasuryAccountId, movementDate, req.auth!.permissions);

        const [drawer] = await tx
          .select({ id: treasuryAccountsTable.id, type: treasuryAccountsTable.type })
          .from(treasuryAccountsTable)
          .where(
            and(
              eq(treasuryAccountsTable.id, effectiveTreasuryId),
              eq(treasuryAccountsTable.storeId, storeId),
            ),
          )
          .limit(1);
        if (!drawer) throw new Error("TREASURY_ACCOUNT_NOT_FOUND");

        const [mov] = await tx
          .insert(equityMovementsTable)
          .values({
            storeId,
            type,
            amount: money(amount),
            movementDate: dateStr(movementDate),
            description: description ?? null,
            treasuryAccountId: drawer.id,
            createdBy: userId,
          })
          .returning({ id: equityMovementsTable.id });

        const treasuryCode = TREASURY_TYPE_TO_ACCOUNT_CODE[drawer.type];

        if (type === "WITHDRAWAL") {
          await postTreasuryTransaction(tx, {
            storeId,
            treasuryAccountId: drawer.id,
            direction: "OUT",
            amount,
            referenceType: "WITHDRAWAL",
            referenceId: mov.id,
            description: description ?? "مسحوبات المالك",
            userId,
          });
          await postJournalEntry(tx, {
            storeId,
            userId,
            description: description ?? "مسحوبات المالك",
            referenceType: "WITHDRAWAL",
            referenceId: mov.id,
            lines: [
              { code: "3100", debit: amount },
              { code: treasuryCode, credit: amount },
            ],
          });
        } else {
          await postTreasuryTransaction(tx, {
            storeId,
            treasuryAccountId: drawer.id,
            direction: "IN",
            amount,
            referenceType: "DEPOSIT",
            referenceId: mov.id,
            description: description ?? "إيداع رأس مال",
            userId,
          });
          await postJournalEntry(tx, {
            storeId,
            userId,
            description: description ?? "إيداع رأس مال",
            referenceType: "DEPOSIT",
            referenceId: mov.id,
            lines: [
              { code: treasuryCode, debit: amount },
              { code: "3000", credit: amount },
            ],
          });
        }

        return mov.id;
      });
    } catch (err) {
      if (err instanceof Error && err.message === "UNAUTHORIZED_MAIN_SAFE") {
        res.status(403).json({ error: "ليس لديك صلاحية لاستخدام الخزينة الرئيسية (أو لعمليات بأثر رجعي)" });
        return;
      }
      if (err instanceof Error && err.message === "TREASURY_ACCOUNT_NOT_FOUND") {
        res.status(404).json({ error: "حساب الخزينة غير موجود" });
        return;
      }
      if (err instanceof Error && err.message === "INSUFFICIENT_TREASURY") {
        res.status(400).json({ error: "رصيد الخزينة غير كافٍ" });
        return;
      }
      throw err;
    }

    await writeAuditLog({
      storeId,
      userId,
      action: type === "WITHDRAWAL" ? "equity.withdrawal" : "equity.deposit",
      entityType: "equity_movement",
      entityId: movementId,
      newValue: { type, amount, treasuryAccountId },
      ipAddress: clientIp(req),
    });

    const [row] = await db
      .select({
        id: equityMovementsTable.id,
        type: equityMovementsTable.type,
        amount: equityMovementsTable.amount,
        movementDate: equityMovementsTable.movementDate,
        description: equityMovementsTable.description,
        treasuryAccountId: equityMovementsTable.treasuryAccountId,
        createdAt: equityMovementsTable.createdAt,
      })
      .from(equityMovementsTable)
      .where(eq(equityMovementsTable.id, movementId))
      .limit(1);

    res.status(201).json({ ...row, createdAt: iso(row.createdAt) });
  },
);


// ── Delete / Reverse Expense ─────────────────────────────────────────────────

router.delete(
  "/finance/expenses/:id",
  requireAuth,
  requirePermission("finance.delete"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;
    const id = String(req.params["id"]);

    await ensureStoreFinancials(db, storeId);

    try {
      await db.transaction(async (tx) => {
        const [exp] = await tx
          .select({
            id: expensesTable.id,
            amount: expensesTable.amount,
            treasuryAccountId: expensesTable.treasuryAccountId,
            description: expensesTable.description,
          })
          .from(expensesTable)
          .where(and(eq(expensesTable.id, id), eq(expensesTable.storeId, storeId)))
          .limit(1);
        if (!exp) throw new Error("EXPENSE_NOT_FOUND");

        const [drawer] = await tx
          .select({ id: treasuryAccountsTable.id, type: treasuryAccountsTable.type })
          .from(treasuryAccountsTable)
          .where(eq(treasuryAccountsTable.id, exp.treasuryAccountId))
          .limit(1);
        if (!drawer) throw new Error("TREASURY_ACCOUNT_NOT_FOUND");

        const amount = toNum(exp.amount);

        // Reverse treasury: post IN to cancel the original OUT.
        await postTreasuryTransaction(tx, {
          storeId,
          treasuryAccountId: drawer.id,
          direction: "IN",
          amount,
          referenceType: "EXPENSE_REVERSAL",
          referenceId: exp.id,
          description: `إلغاء مصروف: ${exp.description ?? ""}`,
          userId,
        });

        // Reverse journal: Dr. Treasury Account / Cr. Operating Expenses (5100).
        await postJournalEntry(tx, {
          storeId,
          userId,
          description: `إلغاء مصروف: ${exp.description ?? ""}`,
          referenceType: "EXPENSE_REVERSAL",
          referenceId: exp.id,
          lines: [
            { code: TREASURY_TYPE_TO_ACCOUNT_CODE[drawer.type], debit: amount },
            { code: "5100", credit: amount },
          ],
        });

        // Hard delete the expense from the expenses table
        await tx.delete(expensesTable).where(eq(expensesTable.id, exp.id));
      });
    } catch (err) {
      if (err instanceof Error && err.message === "EXPENSE_NOT_FOUND") {
        res.status(404).json({ error: "المصروف غير موجود" });
        return;
      }
      if (err instanceof Error && err.message === "TREASURY_ACCOUNT_NOT_FOUND") {
        res.status(404).json({ error: "حساب الخزينة غير موجود" });
        return;
      }
      throw err;
    }

    await writeAuditLog({
      storeId,
      userId,
      action: "expense.reverse",
      entityType: "expense",
      entityId: id,
      ipAddress: clientIp(req),
    });

    res.status(204).end();
  },
);

// ── Delete Salary (PENDING only) ─────────────────────────────────────────────

router.delete(
  "/finance/salaries/:id",
  requireAuth,
  requirePermission("finance.delete"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;
    const id = String(req.params["id"]);

    await ensureStoreFinancials(db, storeId);

    try {
      await db.transaction(async (tx) => {
        const [rec] = await tx
          .select({
            id: salaryRecordsTable.id,
            status: salaryRecordsTable.status,
            baseSalary: salaryRecordsTable.baseSalary,
            bonuses: salaryRecordsTable.bonuses,
            periodMonth: salaryRecordsTable.periodMonth,
          })
          .from(salaryRecordsTable)
          .where(and(eq(salaryRecordsTable.id, id), eq(salaryRecordsTable.storeId, storeId)))
          .limit(1);
        if (!rec) throw new Error("SALARY_NOT_FOUND");
        if (rec.status === "PAID") throw new Error("ALREADY_PAID");

        const gross = toNum(rec.baseSalary) + toNum(rec.bonuses);

        // Reverse the accrual journal: Dr. Salaries Payable (2100) / Cr. Salary Expense (5200).
        if (gross > 0) {
          await postJournalEntry(tx, {
            storeId,
            userId,
            description: `إلغاء استحقاق راتب ${rec.periodMonth}`,
            referenceType: "SALARY_REVERSAL",
            referenceId: rec.id,
            lines: [
              { code: "2100", debit: gross },
              { code: "5200", credit: gross },
            ],
          });
        }

        // Hard delete the PENDING salary record (no treasury touched yet).
        await tx.delete(salaryRecordsTable).where(eq(salaryRecordsTable.id, id));
      });
    } catch (err) {
      if (err instanceof Error && err.message === "SALARY_NOT_FOUND") {
        res.status(404).json({ error: "سجل الراتب غير موجود" });
        return;
      }
      if (err instanceof Error && err.message === "ALREADY_PAID") {
        res.status(400).json({ error: "لا يمكن حذف راتب مدفوع" });
        return;
      }
      throw err;
    }

    await writeAuditLog({
      storeId,
      userId,
      action: "salary.delete",
      entityType: "salary_record",
      entityId: id,
      ipAddress: clientIp(req),
    });

    res.status(204).end();
  },
);

// ── Delete / Reverse Employee Advance ────────────────────────────────────────

router.delete(
  "/finance/advances/:id",
  requireAuth,
  requirePermission("finance.delete"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;
    const id = String(req.params["id"]);

    await ensureStoreFinancials(db, storeId);

    try {
      await db.transaction(async (tx) => {
        const [adv] = await tx
          .select({
            id: employeeAdvancesTable.id,
            employeeId: employeeAdvancesTable.employeeId,
            amount: employeeAdvancesTable.amount,
            treasuryAccountId: employeeAdvancesTable.treasuryAccountId,
            notes: employeeAdvancesTable.notes,
          })
          .from(employeeAdvancesTable)
          .where(and(eq(employeeAdvancesTable.id, id), eq(employeeAdvancesTable.storeId, storeId)))
          .limit(1);
        if (!adv) throw new Error("ADVANCE_NOT_FOUND");

        const [employee] = await tx
          .select({ id: employeesTable.id, advanceBalance: employeesTable.advanceBalance })
          .from(employeesTable)
          .where(eq(employeesTable.id, adv.employeeId))
          .limit(1);
        if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");

        const [drawer] = await tx
          .select({ id: treasuryAccountsTable.id, type: treasuryAccountsTable.type })
          .from(treasuryAccountsTable)
          .where(eq(treasuryAccountsTable.id, adv.treasuryAccountId))
          .limit(1);
        if (!drawer) throw new Error("TREASURY_ACCOUNT_NOT_FOUND");

        const amount = toNum(adv.amount);
        const currentBalance = toNum(employee.advanceBalance);

        if (currentBalance < amount) {
          throw new Error("ADVANCE_PARTIALLY_RECOVERED");
        }

        // Reverse treasury: IN to cancel the original OUT.
        await postTreasuryTransaction(tx, {
          storeId,
          treasuryAccountId: drawer.id,
          direction: "IN",
          amount,
          referenceType: "SALARY",
          referenceId: adv.id,
          description: `إلغاء سلفة: ${adv.notes ?? "سلفة موظف"}`,
          userId,
        });

        // Reverse journal: Dr. Treasury / Cr. Employee Receivable (1300).
        await postJournalEntry(tx, {
          storeId,
          userId,
          description: "إلغاء سلفة موظف",
          referenceType: "SALARY_REVERSAL",
          referenceId: adv.id,
          lines: [
            { code: TREASURY_TYPE_TO_ACCOUNT_CODE[drawer.type], debit: amount },
            { code: "1300", credit: amount },
          ],
        });

        // Decrement employee advance balance.
        await tx
          .update(employeesTable)
          .set({ advanceBalance: money(currentBalance - amount) })
          .where(eq(employeesTable.id, employee.id));

        // Hard delete the advance row.
        await tx.delete(employeeAdvancesTable).where(eq(employeeAdvancesTable.id, id));
      });
    } catch (err) {
      if (err instanceof Error && err.message === "ADVANCE_NOT_FOUND") {
        res.status(404).json({ error: "السلفة غير موجودة" });
        return;
      }
      if (err instanceof Error && err.message === "ADVANCE_PARTIALLY_RECOVERED") {
        res.status(400).json({ error: "لا يمكن حذف السلفة لأنه تم استرداد جزء منها من راتب سابق" });
        return;
      }
      if (err instanceof Error && err.message === "EMPLOYEE_NOT_FOUND") {
        res.status(404).json({ error: "الموظف غير موجود" });
        return;
      }
      if (err instanceof Error && err.message === "TREASURY_ACCOUNT_NOT_FOUND") {
        res.status(404).json({ error: "حساب الخزينة غير موجود" });
        return;
      }
      throw err;
    }

    await writeAuditLog({
      storeId,
      userId,
      action: "advance.delete",
      entityType: "employee_advance",
      entityId: id,
      ipAddress: clientIp(req),
    });

    res.status(204).end();
  },
);

// ── Delete / Reverse Equity Movement ─────────────────────────────────────────

router.delete(
  "/finance/equity-movements/:id",
  requireAuth,
  requirePermission("finance.delete"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;
    const id = String(req.params["id"]);

    await ensureStoreFinancials(db, storeId);

    try {
      await db.transaction(async (tx) => {
        const [mov] = await tx
          .select({
            id: equityMovementsTable.id,
            type: equityMovementsTable.type,
            amount: equityMovementsTable.amount,
            treasuryAccountId: equityMovementsTable.treasuryAccountId,
            description: equityMovementsTable.description,
          })
          .from(equityMovementsTable)
          .where(and(eq(equityMovementsTable.id, id), eq(equityMovementsTable.storeId, storeId)))
          .limit(1);
        if (!mov) throw new Error("MOVEMENT_NOT_FOUND");

        const [drawer] = await tx
          .select({ id: treasuryAccountsTable.id, type: treasuryAccountsTable.type })
          .from(treasuryAccountsTable)
          .where(eq(treasuryAccountsTable.id, mov.treasuryAccountId))
          .limit(1);
        if (!drawer) throw new Error("TREASURY_ACCOUNT_NOT_FOUND");

        const amount = toNum(mov.amount);
        const treasuryCode = TREASURY_TYPE_TO_ACCOUNT_CODE[drawer.type];

        if (mov.type === "WITHDRAWAL") {
          // Original was treasury OUT; reverse with treasury IN.
          await postTreasuryTransaction(tx, {
            storeId,
            treasuryAccountId: drawer.id,
            direction: "IN",
            amount,
            referenceType: "WITHDRAWAL_REVERSAL",
            referenceId: mov.id,
            description: `إلغاء مسحوبات: ${mov.description ?? "مسحوبات المالك"}`,
            userId,
          });
          await postJournalEntry(tx, {
            storeId,
            userId,
            description: "إلغاء مسحوبات المالك",
            referenceType: "WITHDRAWAL_REVERSAL",
            referenceId: mov.id,
            lines: [
              { code: treasuryCode, debit: amount },
              { code: "3100", credit: amount },
            ],
          });
        } else {
          // DEPOSIT: original was treasury IN; reverse with treasury OUT.
          await postTreasuryTransaction(tx, {
            storeId,
            treasuryAccountId: drawer.id,
            direction: "OUT",
            amount,
            referenceType: "DEPOSIT_REVERSAL",
            referenceId: mov.id,
            description: `إلغاء إيداع: ${mov.description ?? "إيداع رأس مال"}`,
            userId,
            allowNegative: true,
          });
          await postJournalEntry(tx, {
            storeId,
            userId,
            description: "إلغاء إيداع رأس مال",
            referenceType: "DEPOSIT_REVERSAL",
            referenceId: mov.id,
            lines: [
              { code: "3000", debit: amount },
              { code: treasuryCode, credit: amount },
            ],
          });
        }

        // Hard delete the equity movement row.
        await tx.delete(equityMovementsTable).where(eq(equityMovementsTable.id, id));
      });
    } catch (err) {
      if (err instanceof Error && err.message === "MOVEMENT_NOT_FOUND") {
        res.status(404).json({ error: "الحركة غير موجودة" });
        return;
      }
      if (err instanceof Error && err.message === "TREASURY_ACCOUNT_NOT_FOUND") {
        res.status(404).json({ error: "حساب الخزينة غير موجود" });
        return;
      }
      if (err instanceof Error && err.message === "INSUFFICIENT_TREASURY") {
        res.status(400).json({ error: "رصيد الخزينة غير كافٍ لإلغاء الإيداع" });
        return;
      }
      throw err;
    }

    await writeAuditLog({
      storeId,
      userId,
      action: "equity.delete",
      entityType: "equity_movement",
      entityId: id,
      ipAddress: clientIp(req),
    });

    res.status(204).end();
  },
);

export default router;
