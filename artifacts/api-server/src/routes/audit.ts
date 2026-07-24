import { Router, type IRouter } from "express";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { db, auditLogsTable, usersTable } from "@workspace/db";
import { ListAuditLogsQueryParams } from "@workspace/api-zod";
import { requireAuth, requirePermission } from "../middleware/auth";

const router: IRouter = Router();

// GET /audit-logs — paginated, store-scoped, newest first.
router.get("/audit-logs", requireAuth, requirePermission("audit.view"), async (req, res) => {
  const parsed = ListAuditLogsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "معاملات غير صالحة" });
    return;
  }
  const { page, pageSize, action, entityType } = parsed.data;
  const storeId = req.auth!.storeId;

  const conditions: SQL[] = [eq(auditLogsTable.storeId, storeId)];
  if (action && action.trim()) {
    conditions.push(eq(auditLogsTable.action, action.trim()));
  }
  if (entityType && entityType.trim()) {
    conditions.push(eq(auditLogsTable.entityType, entityType.trim()));
  }
  const where = and(...conditions);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(auditLogsTable)
    .where(where);

  const rows = await db
    .select({
      id: auditLogsTable.id,
      action: auditLogsTable.action,
      entityType: auditLogsTable.entityType,
      entityId: auditLogsTable.entityId,
      userId: auditLogsTable.userId,
      userName: usersTable.fullName,
      ipAddress: auditLogsTable.ipAddress,
      createdAt: auditLogsTable.createdAt,
    })
    .from(auditLogsTable)
    .leftJoin(usersTable, eq(auditLogsTable.userId, usersTable.id))
    .where(where)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  res.json({
    items: rows.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      userId: r.userId,
      userName: r.userName,
      ipAddress: r.ipAddress,
      createdAt: r.createdAt.toISOString(),
    })),
    total: count,
    page,
    pageSize,
  });
});

export default router;
