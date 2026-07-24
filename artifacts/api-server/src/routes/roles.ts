import { Router, type IRouter, type Request } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, rolesTable, usersTable } from "@workspace/db";
import { CreateRoleBody, UpdateRoleBody } from "@workspace/api-zod";
import { isKnownPermission, WILDCARD_PERMISSION } from "@workspace/shared";
import { writeAuditLog } from "../lib/audit";
import { requireAuth, requirePermission } from "../middleware/auth";

const router: IRouter = Router();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clientIp(req: Request): string | null {
  return req.ip ?? null;
}

// Validates that every requested permission key exists in the catalog (the
// global wildcard is reserved for the system Admin role and rejected here).
function invalidPermissions(perms: string[]): string[] {
  return perms.filter(
    (p) => p === WILDCARD_PERMISSION || !isKnownPermission(p),
  );
}

interface RoleRow {
  id: string;
  name: string;
  nameAr: string | null;
  permissions: string[];
  isSystem: boolean;
  userCount: number;
  createdAt: Date;
}

function toRoleDto(row: RoleRow) {
  return {
    id: row.id,
    name: row.name,
    nameAr: row.nameAr,
    permissions: row.permissions ?? [],
    isSystem: row.isSystem,
    userCount: row.userCount,
    createdAt: row.createdAt.toISOString(),
  };
}

// GET /roles
router.get("/roles", requireAuth, requirePermission("roles.view"), async (req, res) => {
  const storeId = req.auth!.storeId;
  const rows = await db
    .select({
      id: rolesTable.id,
      name: rolesTable.name,
      nameAr: rolesTable.nameAr,
      permissions: rolesTable.permissions,
      isSystem: rolesTable.isSystem,
      createdAt: rolesTable.createdAt,
      userCount: sql<number>`(
        select count(*) from ${usersTable}
        where ${usersTable.roleId} = ${rolesTable.id}
          and ${usersTable.isDeleted} = false
      )`,
    })
    .from(rolesTable)
    .where(eq(rolesTable.storeId, storeId))
    .orderBy(asc(rolesTable.createdAt));
  res.json(rows.map(toRoleDto));
});

// POST /roles
router.post("/roles", requireAuth, requirePermission("roles.manage"), async (req, res) => {
  const parsed = CreateRoleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
    return;
  }
  const storeId = req.auth!.storeId;
  const input = parsed.data;

  const bad = invalidPermissions(input.permissions);
  if (bad.length > 0) {
    res.status(400).json({ error: `صلاحيات غير معروفة: ${bad.join(", ")}` });
    return;
  }

  const [existing] = await db
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(and(eq(rolesTable.storeId, storeId), eq(rolesTable.name, input.name)))
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "اسم الدور مستخدم بالفعل" });
    return;
  }

  const [created] = await db
    .insert(rolesTable)
    .values({
      storeId,
      name: input.name,
      nameAr: input.nameAr ?? null,
      permissions: input.permissions,
      isSystem: false,
    })
    .returning();

  await writeAuditLog({
    storeId,
    userId: req.auth!.userId,
    action: "role.created",
    entityType: "role",
    entityId: created.id,
    newValue: { name: input.name, permissions: input.permissions },
    ipAddress: clientIp(req),
  });

  res.status(201).json(
    toRoleDto({ ...created, userCount: 0 } as RoleRow),
  );
});

// GET /roles/:id
router.get("/roles/:id", requireAuth, requirePermission("roles.view"), async (req, res) => {
  const id = String(req.params["id"]);
  if (!UUID_RE.test(id)) {
    res.status(404).json({ error: "الدور غير موجود" });
    return;
  }
  const [row] = await db
    .select({
      id: rolesTable.id,
      name: rolesTable.name,
      nameAr: rolesTable.nameAr,
      permissions: rolesTable.permissions,
      isSystem: rolesTable.isSystem,
      createdAt: rolesTable.createdAt,
      userCount: sql<number>`(
        select count(*) from ${usersTable}
        where ${usersTable.roleId} = ${rolesTable.id}
          and ${usersTable.isDeleted} = false
      )`,
    })
    .from(rolesTable)
    .where(and(eq(rolesTable.id, id), eq(rolesTable.storeId, req.auth!.storeId)))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "الدور غير موجود" });
    return;
  }
  res.json(toRoleDto(row));
});

// PATCH /roles/:id
router.patch("/roles/:id", requireAuth, requirePermission("roles.manage"), async (req, res) => {
  const id = String(req.params["id"]);
  if (!UUID_RE.test(id)) {
    res.status(404).json({ error: "الدور غير موجود" });
    return;
  }
  const parsed = UpdateRoleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
    return;
  }
  const storeId = req.auth!.storeId;
  const input = parsed.data;

  const [current] = await db
    .select()
    .from(rolesTable)
    .where(and(eq(rolesTable.id, id), eq(rolesTable.storeId, storeId)))
    .limit(1);
  if (!current) {
    res.status(404).json({ error: "الدور غير موجود" });
    return;
  }

  // The Admin (wildcard) system role's permissions are immutable.
  const isAdminRole = current.permissions?.includes(WILDCARD_PERMISSION);
  if (isAdminRole && input.permissions) {
    res.status(400).json({ error: "لا يمكن تعديل صلاحيات دور مدير النظام" });
    return;
  }

  if (input.permissions) {
    const bad = invalidPermissions(input.permissions);
    if (bad.length > 0) {
      res.status(400).json({ error: `صلاحيات غير معروفة: ${bad.join(", ")}` });
      return;
    }
  }

  if (input.name && input.name !== current.name) {
    const [dupe] = await db
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(and(eq(rolesTable.storeId, storeId), eq(rolesTable.name, input.name)))
      .limit(1);
    if (dupe) {
      res.status(409).json({ error: "اسم الدور مستخدم بالفعل" });
      return;
    }
  }

  await db
    .update(rolesTable)
    .set({
      name: input.name ?? current.name,
      nameAr: input.nameAr === undefined ? current.nameAr : input.nameAr,
      permissions: input.permissions ?? current.permissions,
    })
    .where(eq(rolesTable.id, id));

  await writeAuditLog({
    storeId,
    userId: req.auth!.userId,
    action: "role.updated",
    entityType: "role",
    entityId: id,
    oldValue: { name: current.name, permissions: current.permissions },
    newValue: input,
    ipAddress: clientIp(req),
  });

  const [row] = await db
    .select({
      id: rolesTable.id,
      name: rolesTable.name,
      nameAr: rolesTable.nameAr,
      permissions: rolesTable.permissions,
      isSystem: rolesTable.isSystem,
      createdAt: rolesTable.createdAt,
      userCount: sql<number>`(
        select count(*) from ${usersTable}
        where ${usersTable.roleId} = ${rolesTable.id}
          and ${usersTable.isDeleted} = false
      )`,
    })
    .from(rolesTable)
    .where(eq(rolesTable.id, id))
    .limit(1);
  res.json(toRoleDto(row));
});

// DELETE /roles/:id
router.delete("/roles/:id", requireAuth, requirePermission("roles.manage"), async (req, res) => {
  const id = String(req.params["id"]);
  if (!UUID_RE.test(id)) {
    res.status(404).json({ error: "الدور غير موجود" });
    return;
  }
  const storeId = req.auth!.storeId;

  const [current] = await db
    .select()
    .from(rolesTable)
    .where(and(eq(rolesTable.id, id), eq(rolesTable.storeId, storeId)))
    .limit(1);
  if (!current) {
    res.status(404).json({ error: "الدور غير موجود" });
    return;
  }
  if (current.isSystem) {
    res.status(400).json({ error: "لا يمكن حذف دور نظامي" });
    return;
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.roleId, id),
        eq(usersTable.isDeleted, false),
      ),
    );
  if (count > 0) {
    res.status(400).json({ error: "لا يمكن حذف دور مستخدم من قبل مستخدمين" });
    return;
  }

  await db.delete(rolesTable).where(eq(rolesTable.id, id));

  await writeAuditLog({
    storeId,
    userId: req.auth!.userId,
    action: "role.deleted",
    entityType: "role",
    entityId: id,
    oldValue: { name: current.name },
    ipAddress: clientIp(req),
  });

  res.status(204).end();
});

export default router;
