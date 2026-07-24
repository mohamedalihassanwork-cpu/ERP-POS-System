import { db, auditLogsTable } from "@workspace/db";

export interface AuditEntry {
  storeId: string;
  userId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
}

// Writes an immutable audit-log row. Failures are swallowed (logged by caller
// if needed) so auditing never breaks the primary operation, but callers should
// prefer awaiting it inside the same request flow.
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  await db.insert(auditLogsTable).values({
    storeId: entry.storeId,
    userId: entry.userId ?? null,
    action: entry.action,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    oldValue: entry.oldValue ?? null,
    newValue: entry.newValue ?? null,
    ipAddress: entry.ipAddress ?? null,
  });
}
