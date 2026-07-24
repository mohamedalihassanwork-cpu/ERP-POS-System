import type { NextFunction, Request, RequestHandler, Response } from "express";
import { db, usersTable, rolesTable, storesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hasPermission, WILDCARD_PERMISSION } from "@workspace/shared";
import { verifyAccessToken } from "../lib/jwt";

// The authenticated principal attached to each request. StoreId always comes
// from the verified access token — never from client input — to guarantee
// tenant isolation.
export interface AuthContext {
  userId: string;
  storeId: string;
  roleId: string;
  username: string;
  fullName: string;
  permissions: string[];
  storeName: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

// Loads the user, role and store, returning a fully resolved auth context, or
// null when the user is no longer valid (deleted/inactive/missing).
async function loadAuthContext(
  userId: string,
  storeId: string,
): Promise<AuthContext | null> {
  const [row] = await db
    .select({
      userId: usersTable.id,
      storeId: usersTable.storeId,
      roleId: usersTable.roleId,
      username: usersTable.username,
      fullName: usersTable.fullName,
      isActive: usersTable.isActive,
      isDeleted: usersTable.isDeleted,
      permissions: rolesTable.permissions,
      storeName: storesTable.name,
    })
    .from(usersTable)
    .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
    .innerJoin(storesTable, eq(usersTable.storeId, storesTable.id))
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!row) return null;
  if (row.storeId !== storeId) return null;
  if (row.isDeleted || !row.isActive) return null;

  return {
    userId: row.userId,
    storeId: row.storeId,
    roleId: row.roleId,
    username: row.username,
    fullName: row.fullName,
    permissions: row.permissions ?? [],
    storeName: row.storeName,
  };
}

export const requireAuth: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const token = extractBearer(req);
  if (!token) {
    res.status(401).json({ error: "غير مصرح" });
    return;
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    res.status(401).json({ error: "انتهت صلاحية الجلسة" });
    return;
  }

  loadAuthContext(payload.sub, payload.storeId)
    .then((ctx) => {
      if (!ctx) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }
      req.auth = ctx;
      next();
    })
    .catch(next);
};

// Guards a route behind a single permission key. Admin ("*") passes everything.
export function requirePermission(permission: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: "غير مصرح" });
      return;
    }
    if (!hasPermission(auth.permissions, permission)) {
      res.status(403).json({ error: "لا تملك صلاحية لهذا الإجراء" });
      return;
    }
    next();
  };
}

// Guards a route behind multiple permission keys (OR logic).
export function requireAnyPermission(permissions: string[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: "غير مصرح" });
      return;
    }
    const hasAny = permissions.some((p) => hasPermission(auth.permissions, p));
    if (!hasAny) {
      res.status(403).json({ error: "لا تملك صلاحية لهذا الإجراء" });
      return;
    }
    next();
  };
}

export { WILDCARD_PERMISSION };
