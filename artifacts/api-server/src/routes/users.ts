import { Router, type IRouter, type Request } from "express";
import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { db, usersTable, rolesTable } from "@workspace/db";
import {
  CreateUserBody,
  UpdateUserBody,
  ResetUserPasswordBody,
  ListUsersQueryParams,
} from "@workspace/api-zod";
import { hashPassword } from "../lib/password";
import { writeAuditLog } from "../lib/audit";
import { requireAuth, requirePermission } from "../middleware/auth";

const router: IRouter = Router();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clientIp(req: Request): string | null {
  return req.ip ?? null;
}

// ---------------------------------------------------------------------------
// GET /users/search?q=<query>
//
// PUBLIC endpoint — no authentication required.
// Powers the login-screen username autocomplete.
//
// Security:
//   - Returns ONLY id, username, fullName — no passwords, hashes, or permissions.
//   - Only searches active, non-deleted users.
//   - Maximum 8 results to prevent data harvesting.
//   - Requires at least 1 character (enforced below).
// ---------------------------------------------------------------------------
router.get("/users/search", async (req, res) => {
  const q = typeof req.query["q"] === "string" ? req.query["q"].trim() : "";

  if (!q || q.length < 1) {
    res.json({ items: [] });
    return;
  }

  const term = `%${q}%`;
  const termStart = `${q}%`; // for prefix-priority ordering

  try {
    const rows = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        fullName: usersTable.fullName,
      })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.isDeleted, false),
          eq(usersTable.isActive, true),
          or(
            like(usersTable.username, term),
            like(usersTable.fullName, term),
          ),
        ),
      )
      // Prioritise usernames that START WITH the query, then alphabetical
      .orderBy(
        sql`CASE WHEN lower(${usersTable.username}) LIKE lower(${termStart}) THEN 0 ELSE 1 END`,
        asc(usersTable.username),
      )
      .limit(8);

    res.json({ items: rows });
  } catch (err) {
    res.status(500).json({ error: "حدث خطأ أثناء البحث" });
  }
});

const userColumns = {
  id: usersTable.id,
  username: usersTable.username,
  fullName: usersTable.fullName,
  phone: usersTable.phone,
  email: usersTable.email,
  isActive: usersTable.isActive,
  roleId: usersTable.roleId,
  lastLoginAt: usersTable.lastLoginAt,
  lockedUntil: usersTable.lockedUntil,
  createdAt: usersTable.createdAt,
  roleName: rolesTable.name,
  roleNameAr: rolesTable.nameAr,
};

function toUserDto(row: {
  id: string;
  username: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  roleId: string;
  lastLoginAt: Date | null;
  lockedUntil: Date | null;
  createdAt: Date;
  roleName: string;
  roleNameAr: string | null;
}) {
  return {
    id: row.id,
    username: row.username,
    fullName: row.fullName,
    phone: row.phone,
    email: row.email,
    isActive: row.isActive,
    roleId: row.roleId,
    role: { id: row.roleId, name: row.roleName, nameAr: row.roleNameAr },
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    lockedUntil: row.lockedUntil ? row.lockedUntil.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

// GET /users
router.get("/users", requireAuth, requirePermission("users.view"), async (req, res) => {
  const parsed = ListUsersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "معاملات غير صالحة" });
    return;
  }
  const { page, pageSize, search, includeInactive } = parsed.data;
  const storeId = req.auth!.storeId;

  const conditions = [
    eq(usersTable.storeId, storeId),
    eq(usersTable.isDeleted, false),
  ];
  if (includeInactive === false) {
    conditions.push(eq(usersTable.isActive, true));
  }
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    const searchCond = or(
      like(usersTable.username, term),
      like(usersTable.fullName, term),
    );
    if (searchCond) conditions.push(searchCond);
  }
  const where = and(...conditions);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(usersTable)
    .where(where);

  const rows = await db
    .select(userColumns)
    .from(usersTable)
    .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
    .where(where)
    .orderBy(desc(usersTable.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  res.json({
    items: rows.map(toUserDto),
    total: count,
    page,
    pageSize,
  });
});

// POST /users
router.post("/users", requireAuth, requirePermission("users.create"), async (req, res) => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
    return;
  }
  const input = parsed.data;
  const storeId = req.auth!.storeId;

  const [role] = await db
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(and(eq(rolesTable.id, input.roleId), eq(rolesTable.storeId, storeId)))
    .limit(1);
  if (!role) {
    res.status(400).json({ error: "الدور المحدد غير موجود" });
    return;
  }

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(eq(usersTable.storeId, storeId), eq(usersTable.username, input.username)),
    )
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "اسم المستخدم مستخدم بالفعل" });
    return;
  }

  const passwordHash = await hashPassword(input.password);
  const [created] = await db
    .insert(usersTable)
    .values({
      storeId,
      roleId: input.roleId,
      username: input.username,
      passwordHash,
      fullName: input.fullName,
      phone: input.phone ?? null,
      email: input.email ?? null,
      isActive: input.isActive ?? true,
    })
    .returning({ id: usersTable.id });

  await writeAuditLog({
    storeId,
    userId: req.auth!.userId,
    action: "user.created",
    entityType: "user",
    entityId: created.id,
    newValue: { username: input.username, roleId: input.roleId },
    ipAddress: clientIp(req),
  });

  const [row] = await db
    .select(userColumns)
    .from(usersTable)
    .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
    .where(eq(usersTable.id, created.id))
    .limit(1);
  res.status(201).json(toUserDto(row));
});

// GET /users/:id
router.get("/users/:id", requireAuth, requirePermission("users.view"), async (req, res) => {
  const id = String(req.params["id"]);
  if (!UUID_RE.test(id)) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }
  const [row] = await db
    .select(userColumns)
    .from(usersTable)
    .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
    .where(
      and(
        eq(usersTable.id, id),
        eq(usersTable.storeId, req.auth!.storeId),
        eq(usersTable.isDeleted, false),
      ),
    )
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }
  res.json(toUserDto(row));
});

// PATCH /users/:id
router.patch("/users/:id", requireAuth, requirePermission("users.edit"), async (req, res) => {
  const id = String(req.params["id"]);
  if (!UUID_RE.test(id)) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
    return;
  }
  const storeId = req.auth!.storeId;
  const input = parsed.data;

  const [current] = await db
    .select()
    .from(usersTable)
    .where(
      and(
        eq(usersTable.id, id),
        eq(usersTable.storeId, storeId),
        eq(usersTable.isDeleted, false),
      ),
    )
    .limit(1);
  if (!current) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }

  // Self-protection: a user cannot deactivate or demote their own account.
  const isSelf = current.id === req.auth!.userId;
  if (isSelf && input.isActive === false) {
    res.status(400).json({ error: "لا يمكنك إلغاء تفعيل حسابك الخاص" });
    return;
  }
  if (isSelf && input.roleId && input.roleId !== current.roleId) {
    res.status(400).json({ error: "لا يمكنك تغيير دور حسابك الخاص" });
    return;
  }

  if (input.roleId && input.roleId !== current.roleId) {
    const [role] = await db
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(and(eq(rolesTable.id, input.roleId), eq(rolesTable.storeId, storeId)))
      .limit(1);
    if (!role) {
      res.status(400).json({ error: "الدور المحدد غير موجود" });
      return;
    }
  }

  await db
    .update(usersTable)
    .set({
      fullName: input.fullName ?? current.fullName,
      roleId: input.roleId ?? current.roleId,
      phone: input.phone === undefined ? current.phone : input.phone,
      email: input.email === undefined ? current.email : input.email,
      isActive: input.isActive === undefined ? current.isActive : input.isActive,
    })
    .where(eq(usersTable.id, id));

  await writeAuditLog({
    storeId,
    userId: req.auth!.userId,
    action: "user.updated",
    entityType: "user",
    entityId: id,
    oldValue: {
      fullName: current.fullName,
      roleId: current.roleId,
      isActive: current.isActive,
    },
    newValue: input,
    ipAddress: clientIp(req),
  });

  const [row] = await db
    .select(userColumns)
    .from(usersTable)
    .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
    .where(eq(usersTable.id, id))
    .limit(1);
  res.json(toUserDto(row));
});

// DELETE /users/:id (soft delete)
router.delete("/users/:id", requireAuth, requirePermission("users.delete"), async (req, res) => {
  const id = String(req.params["id"]);
  if (!UUID_RE.test(id)) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }
  const storeId = req.auth!.storeId;

  if (id === req.auth!.userId) {
    res.status(400).json({ error: "لا يمكنك حذف حسابك الخاص" });
    return;
  }

  const [current] = await db
    .select({ id: usersTable.id, username: usersTable.username })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.id, id),
        eq(usersTable.storeId, storeId),
        eq(usersTable.isDeleted, false),
      ),
    )
    .limit(1);
  if (!current) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }

  await db
    .update(usersTable)
    .set({ isDeleted: true, deletedAt: new Date(), isActive: false })
    .where(eq(usersTable.id, id));

  await writeAuditLog({
    storeId,
    userId: req.auth!.userId,
    action: "user.deleted",
    entityType: "user",
    entityId: id,
    oldValue: { username: current.username },
    ipAddress: clientIp(req),
  });

  res.status(204).end();
});

// POST /users/:id/reset-password (admin override)
router.post(
  "/users/:id/reset-password",
  requireAuth,
  requirePermission("users.edit"),
  async (req, res) => {
    const id = String(req.params["id"]);
    if (!UUID_RE.test(id)) {
      res.status(404).json({ error: "المستخدم غير موجود" });
      return;
    }
    const parsed = ResetUserPasswordBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;

    const [current] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.id, id),
          eq(usersTable.storeId, storeId),
          eq(usersTable.isDeleted, false),
        ),
      )
      .limit(1);
    if (!current) {
      res.status(404).json({ error: "المستخدم غير موجود" });
      return;
    }

    const passwordHash = await hashPassword(parsed.data.newPassword);
    await db
      .update(usersTable)
      .set({
        passwordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
      })
      .where(eq(usersTable.id, id));

    await writeAuditLog({
      storeId,
      userId: req.auth!.userId,
      action: "user.password_reset",
      entityType: "user",
      entityId: id,
      ipAddress: clientIp(req),
    });

    res.status(204).end();
  },
);

export default router;
