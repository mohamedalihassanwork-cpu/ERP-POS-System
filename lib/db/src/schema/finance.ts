import crypto from "crypto";
import { integer, index, text, sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";
import { storesTable } from "./stores";
import { treasuryAccountsTable } from "./treasury";
import { usersTable } from "./users";

// Expense classification (e.g. Rent, Utilities, Marketing). Tenant-scoped.
export const expenseCategoriesTable = sqliteTable(
  "expense_categories",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    isActive: integer("is_active", { mode: 'boolean' }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("expense_categories_store_name_unique").on(table.storeId, table.name)],
);

// A recorded expense. Posts a treasury OUT and an Operating-Expenses journal entry.
export const expensesTable = sqliteTable(
  "expenses",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => expenseCategoriesTable.id, { onDelete: "restrict" }),
    amount: text("amount").notNull(),
    expenseDate: text("expense_date").notNull(),
    description: text("description"),
    treasuryAccountId: text("treasury_account_id")
      .notNull()
      .references(() => treasuryAccountsTable.id, { onDelete: "restrict" }),
    recordedBy: text("recorded_by")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("expenses_store_date_idx").on(table.storeId, table.expenseDate),
    index("expenses_category_idx").on(table.categoryId),
  ],
);

// Staff record. Optionally linked to a system user account. monthlySalary is the
// default used when generating salary records.
export const employeesTable = sqliteTable(
  "employees",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    userId: text("user_id").references(() => usersTable.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    phone: text("phone"),
    jobTitle: text("job_title"),
    monthlySalary: text("monthly_salary").notNull().default("0"),
    // Outstanding advances owed back by the employee.
    advanceBalance: text("advance_balance").notNull().default("0"),
    isActive: integer("is_active", { mode: 'boolean' }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("employees_store_idx").on(table.storeId)],
);

export const salaryStatusEnum = ["PENDING", "PAID"] as const;
export const payPeriodTypeEnum = ["DAILY", "WEEKLY", "MONTHLY"] as const;

// A salary payment record. Supports daily/weekly/monthly pay periods.
// advanceDeduction = portion of deductions recovered from employee advances.
// otherDeductions   = disciplinary/absence deductions (do NOT reduce advanceBalance).
export const salaryRecordsTable = sqliteTable(
  "salary_records",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "restrict" }),
    // payPeriodType drives how periodLabel is formatted.
    payPeriodType: text("pay_period_type", { enum: payPeriodTypeEnum }).notNull().default("MONTHLY"),
    // periodLabel stores the period in a human-readable format:
    //   MONTHLY → "2025-07", WEEKLY → "2025-W28", DAILY → "2025-07-07"
    periodMonth: text("period_month").notNull(),
    baseSalary: text("base_salary").notNull().default("0"),
    // advanceDeduction: recovered from the employee's outstanding advance balance.
    advanceDeduction: text("advance_deduction").notNull().default("0"),
    // otherDeductions: disciplinary/absence — does NOT reduce advanceBalance.
    otherDeductions: text("other_deductions").notNull().default("0"),
    // deductions kept for backward compatibility = advanceDeduction + otherDeductions.
    deductions: text("deductions").notNull().default("0"),
    bonuses: text("bonuses").notNull().default("0"),
    netAmount: text("net_amount").notNull().default("0"),
    status: text("status", { enum: salaryStatusEnum }).notNull().default("PENDING"),
    treasuryAccountId: text("treasury_account_id").references(() => treasuryAccountsTable.id, {
      onDelete: "restrict",
    }),
    paidAt: integer("paid_at", { mode: "timestamp_ms" }),
    createdBy: text("created_by").references(() => usersTable.id, { onDelete: "restrict" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("salary_records_employee_period_unique").on(table.employeeId, table.periodMonth, table.payPeriodType),
    index("salary_records_store_idx").on(table.storeId),
  ],
);

// Cash advance given to an employee, recovered from future salary.
export const employeeAdvancesTable = sqliteTable(
  "employee_advances",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "restrict" }),
    amount: text("amount").notNull(),
    advanceDate: text("advance_date").notNull(),
    notes: text("notes"),
    treasuryAccountId: text("treasury_account_id")
      .notNull()
      .references(() => treasuryAccountsTable.id, { onDelete: "restrict" }),
    createdBy: text("created_by").references(() => usersTable.id, { onDelete: "restrict" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [index("employee_advances_employee_idx").on(table.employeeId)],
);

export const equityMovementTypeEnum = ["WITHDRAWAL", "DEPOSIT"] as const;

// Owner capital movements: WITHDRAWAL (drawings) or DEPOSIT (capital injection).
export const equityMovementsTable = sqliteTable(
  "equity_movements",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    type: text("type", { enum: equityMovementTypeEnum }).notNull(),
    amount: text("amount").notNull(),
    movementDate: text("movement_date").notNull(),
    description: text("description"),
    treasuryAccountId: text("treasury_account_id")
      .notNull()
      .references(() => treasuryAccountsTable.id, { onDelete: "restrict" }),
    createdBy: text("created_by").references(() => usersTable.id, { onDelete: "restrict" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [index("equity_movements_store_idx").on(table.storeId, table.movementDate)],
);

export type ExpenseCategory = typeof expenseCategoriesTable.$inferSelect;
export type InsertExpenseCategory = typeof expenseCategoriesTable.$inferInsert;
export type Expense = typeof expensesTable.$inferSelect;
export type InsertExpense = typeof expensesTable.$inferInsert;
export type Employee = typeof employeesTable.$inferSelect;
export type InsertEmployee = typeof employeesTable.$inferInsert;
export type SalaryRecord = typeof salaryRecordsTable.$inferSelect;
export type InsertSalaryRecord = typeof salaryRecordsTable.$inferInsert;
export type EmployeeAdvance = typeof employeeAdvancesTable.$inferSelect;
export type InsertEmployeeAdvance = typeof employeeAdvancesTable.$inferInsert;
export type EquityMovement = typeof equityMovementsTable.$inferSelect;
export type InsertEquityMovement = typeof equityMovementsTable.$inferInsert;
