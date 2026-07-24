import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  storesTable,
  rolesTable,
  usersTable,
  sessionsTable,
  auditLogsTable,
} from "@workspace/db";
import {
  CompleteSetupBody,
  LoginBody,
} from "@workspace/api-zod";
import { DEFAULT_ROLES, ADMIN_ROLE_KEY } from "@workspace/shared";
import { config } from "../lib/config";
import { hashPassword, verifyPassword } from "../lib/password";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../lib/jwt";
import { hashToken } from "../lib/tokens";
import { writeAuditLog } from "../lib/audit";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

function clientIp(req: Request): string | null {
  return req.ip ?? null;
}

interface ResolvedUser {
  id: string;
  storeId: string;
  roleId: string;
  username: string;
  fullName: string;
  permissions: string[];
  storeName: string;
}

async function resolveUser(userId: string): Promise<ResolvedUser | null> {
  const [row] = await db
    .select({
      id: usersTable.id,
      storeId: usersTable.storeId,
      roleId: usersTable.roleId,
      username: usersTable.username,
      fullName: usersTable.fullName,
      permissions: rolesTable.permissions,
      storeName: storesTable.name,
      roleNameAr: rolesTable.nameAr,
      roleName: rolesTable.name,
    })
    .from(usersTable)
    .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
    .innerJoin(storesTable, eq(usersTable.storeId, storesTable.id))
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    storeId: row.storeId,
    roleId: row.roleId,
    username: row.username,
    fullName: row.fullName,
    permissions: row.permissions ?? [],
    storeName: row.storeName,
  };
}

async function buildCurrentUser(userId: string) {
  const [row] = await db
    .select({
      id: usersTable.id,
      storeId: usersTable.storeId,
      username: usersTable.username,
      fullName: usersTable.fullName,
      permissions: rolesTable.permissions,
      storeName: storesTable.name,
      roleId: rolesTable.id,
      roleName: rolesTable.name,
      roleNameAr: rolesTable.nameAr,
    })
    .from(usersTable)
    .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
    .innerJoin(storesTable, eq(usersTable.storeId, storesTable.id))
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    storeId: row.storeId,
    username: row.username,
    fullName: row.fullName,
    role: { id: row.roleId, name: row.roleName, nameAr: row.roleNameAr },
    permissions: row.permissions ?? [],
    storeName: row.storeName,
  };
}

// Creates a refresh session row and returns the signed refresh token.
async function issueSession(
  userId: string,
  storeId: string,
  req: Request,
): Promise<string> {
  const expiresAt = new Date(
    Date.now() + config.jwt.refreshTtlSeconds * 1000,
  );
  const [session] = await db
    .insert(sessionsTable)
    .values({
      storeId,
      userId,
      refreshTokenHash: "pending",
      userAgent: req.headers["user-agent"] ?? null,
      ipAddress: clientIp(req),
      expiresAt,
    })
    .returning({ id: sessionsTable.id });

  const refreshToken = signRefreshToken({
    sub: userId,
    storeId,
    sid: session.id,
  });
  await db
    .update(sessionsTable)
    .set({ refreshTokenHash: hashToken(refreshToken) })
    .where(eq(sessionsTable.id, session.id));
  return refreshToken;
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(config.cookies.refreshName, token, {
    httpOnly: true,
    sameSite: config.cookies.sameSite,
    secure: config.cookies.secure,
    path: config.cookies.path,
    maxAge: config.jwt.refreshTtlSeconds * 1000,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(config.cookies.refreshName, {
    httpOnly: true,
    sameSite: config.cookies.sameSite,
    secure: config.cookies.secure,
    path: config.cookies.path,
  });
}

// GET /auth/setup-status
router.get("/auth/setup-status", async (_req, res) => {
  const [store] = await db
    .select({ id: storesTable.id, isSetupComplete: storesTable.isSetupComplete })
    .from(storesTable)
    .limit(1);

  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.isDeleted, false))
    .limit(1);

  res.json({
    storeExists: Boolean(store),
    isSetupComplete: Boolean(store?.isSetupComplete) && Boolean(user),
  });
});

// POST /auth/setup — one-time wizard creating store + default roles + admin
router.post("/auth/setup", async (req, res) => {
  const parsed = CompleteSetupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
    return;
  }

  const [existing] = await db
    .select({ id: storesTable.id, isSetupComplete: storesTable.isSetupComplete })
    .from(storesTable)
    .limit(1);
  if (existing?.isSetupComplete) {
    res.status(409).json({ error: "تم إكمال الإعداد مسبقاً" });
    return;
  }

  const input = parsed.data;
  const passwordHash = await hashPassword(input.adminPassword);

  const result = await db.transaction(async (tx) => {
    const [store] = await tx
      .insert(storesTable)
      .values({
        name: input.storeName,
        phone: input.phone ?? null,
        address: input.address ?? null,
        city: input.city ?? null,
        currency: input.currency ?? "EGP",
        taxRate: String(input.taxRate ?? 0),
        logoUrl: input.logoUrl ?? null,
        receiptPrinterWidth: input.printerWidth,
        receiptPaperType: input.paperType ?? null,
        isSetupComplete: true,
      })
      .returning({ id: storesTable.id });

    const roleIdByKey = new Map<string, string>();
    for (const role of DEFAULT_ROLES) {
      const [created] = await tx
        .insert(rolesTable)
        .values({
          storeId: store.id,
          name: role.name,
          nameAr: role.nameAr,
          permissions: role.permissions,
          isSystem: role.isSystem,
        })
        .returning({ id: rolesTable.id });
      roleIdByKey.set(role.key, created.id);
    }

    const adminRoleId = roleIdByKey.get(ADMIN_ROLE_KEY);
    if (!adminRoleId) throw new Error("Admin role was not seeded");

    const [admin] = await tx
      .insert(usersTable)
      .values({
        storeId: store.id,
        roleId: adminRoleId,
        username: input.adminUsername,
        passwordHash,
        fullName: input.adminFullName,
        isActive: true,
      })
      .returning({ id: usersTable.id });

    await tx.insert(auditLogsTable).values({
      storeId: store.id,
      userId: admin.id,
      action: "setup.completed",
      entityType: "store",
      entityId: store.id,
      ipAddress: clientIp(req),
    });

    return { storeId: store.id };
  });

  res.status(201).json({ storeId: result.storeId, message: "تم إنشاء المتجر بنجاح" });
});

// POST /auth/login
router.post("/auth/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    return;
  }
  const { username, password } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(
      and(eq(usersTable.username, username), eq(usersTable.isDeleted, false)),
    )
    .limit(1);

  const genericError = () =>
    res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });

  if (!user) {
    await verifyPassword(password, "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
    genericError();
    return;
  }

  const now = new Date();
  if (user.lockedUntil && user.lockedUntil > now) {
    res.status(423).json({
      error: "الحساب مقفل مؤقتاً بسبب محاولات دخول فاشلة. حاول لاحقاً",
    });
    return;
  }

  if (!user.isActive) {
    res.status(401).json({ error: "هذا الحساب غير مفعّل" });
    return;
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= config.auth.maxFailedAttempts;
    await db
      .update(usersTable)
      .set({
        failedLoginAttempts: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock
          ? new Date(Date.now() + config.auth.lockoutMinutes * 60 * 1000)
          : null,
      })
      .where(eq(usersTable.id, user.id));
    await writeAuditLog({
      storeId: user.storeId,
      userId: user.id,
      action: shouldLock ? "auth.account_locked" : "auth.login_failed",
      entityType: "user",
      entityId: user.id,
      ipAddress: clientIp(req),
    });
    if (shouldLock) {
      res.status(423).json({
        error: "تم قفل الحساب بعد محاولات فاشلة متعددة. حاول بعد 15 دقيقة",
      });
      return;
    }
    genericError();
    return;
  }

  await db
    .update(usersTable)
    .set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: now })
    .where(eq(usersTable.id, user.id));

  const refreshToken = await issueSession(user.id, user.storeId, req);
  const accessToken = signAccessToken({
    sub: user.id,
    storeId: user.storeId,
    roleId: user.roleId,
  });
  setRefreshCookie(res, refreshToken);

  await writeAuditLog({
    storeId: user.storeId,
    userId: user.id,
    action: "auth.login",
    entityType: "user",
    entityId: user.id,
    ipAddress: clientIp(req),
  });

  const currentUser = await buildCurrentUser(user.id);
  res.json({ accessToken, user: currentUser });
});

// POST /auth/refresh — verify cookie, rotate session, issue new access token
router.post("/auth/refresh", async (req, res) => {
  const token = req.cookies?.[config.cookies.refreshName];
  if (!token || typeof token !== "string") {
    res.status(401).json({ error: "جلسة غير صالحة" });
    return;
  }

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    clearRefreshCookie(res);
    res.status(401).json({ error: "انتهت صلاحية الجلسة" });
    return;
  }

  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, payload.sid))
    .limit(1);

  const now = new Date();
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= now ||
    session.refreshTokenHash !== hashToken(token)
  ) {
    clearRefreshCookie(res);
    res.status(401).json({ error: "جلسة غير صالحة" });
    return;
  }

  const user = await resolveUser(payload.sub);
  if (!user) {
    await db
      .update(sessionsTable)
      .set({ revokedAt: now })
      .where(eq(sessionsTable.id, session.id));
    clearRefreshCookie(res);
    res.status(401).json({ error: "غير مصرح" });
    return;
  }

  // Rotate: revoke the used session and issue a fresh one.
  await db
    .update(sessionsTable)
    .set({ revokedAt: now })
    .where(eq(sessionsTable.id, session.id));
  const newRefresh = await issueSession(user.id, user.storeId, req);
  const accessToken = signAccessToken({
    sub: user.id,
    storeId: user.storeId,
    roleId: user.roleId,
  });
  setRefreshCookie(res, newRefresh);

  const currentUser = await buildCurrentUser(user.id);
  res.json({ accessToken, user: currentUser });
});

// POST /auth/logout
router.post("/auth/logout", async (req, res) => {
  const token = req.cookies?.[config.cookies.refreshName];
  if (token && typeof token === "string") {
    try {
      const payload = verifyRefreshToken(token);
      await db
        .update(sessionsTable)
        .set({ revokedAt: new Date() })
        .where(eq(sessionsTable.id, payload.sid));
    } catch {
      // ignore — already invalid
    }
  }
  clearRefreshCookie(res);
  res.status(204).end();
});

// GET /auth/me
router.get("/auth/me", requireAuth, async (req, res) => {
  const currentUser = await buildCurrentUser(req.auth!.userId);
  if (!currentUser) {
    res.status(401).json({ error: "غير مصرح" });
    return;
  }
  res.json(currentUser);
});

export default router;
