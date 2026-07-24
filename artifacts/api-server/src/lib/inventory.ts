import { sql } from "drizzle-orm";
import { db, inventoryItemsTable, inventoryMovementsTable } from "@workspace/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type InventoryMovementType =
  | "SALE"
  | "SALE_RETURN"
  | "PURCHASE"
  | "PURCHASE_RETURN"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT"
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "STOCK_COUNT_CORRECTION";

export interface InventoryPosting {
  storeId: string;
  variantId: string;
  warehouseId: string;
  type: InventoryMovementType;
  // Signed quantity: positive adds stock (IN), negative removes (OUT).
  quantityChange: number;
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
  userId?: string | null;
  // When true, allow the cached quantity to go below zero (e.g. corrections).
  allowNegative?: boolean;
  createdAt?: Date;
}

// Posts a single immutable inventory movement inside the caller's transaction:
// atomically upserts the cached stock row, guards against negative stock unless
// allowed, and appends the movement row carrying the resulting balanceAfter.
// Throws INSUFFICIENT_STOCK when an OUT movement would overdraw the warehouse.
export async function postInventoryMovement(
  tx: Tx,
  p: InventoryPosting,
): Promise<{ movementId: string; balanceAfter: number }> {
  const [item] = await tx
    .insert(inventoryItemsTable)
    .values({
      storeId: p.storeId,
      variantId: p.variantId,
      warehouseId: p.warehouseId,
      quantity: p.quantityChange,
    })
    .onConflictDoUpdate({
      target: [inventoryItemsTable.variantId, inventoryItemsTable.warehouseId],
      set: { quantity: sql`${inventoryItemsTable.quantity} + ${p.quantityChange}` },
    })
    .returning({ quantity: inventoryItemsTable.quantity });

  const newQty = item.quantity;
  if (!p.allowNegative && newQty < 0) {
    throw new Error("INSUFFICIENT_STOCK");
  }

  const [movement] = await tx
    .insert(inventoryMovementsTable)
    .values({
      storeId: p.storeId,
      variantId: p.variantId,
      warehouseId: p.warehouseId,
      type: p.type,
      quantityChange: p.quantityChange,
      balanceAfter: newQty,
      referenceType: p.referenceType ?? null,
      referenceId: p.referenceId ?? null,
      notes: p.notes ?? null,
      createdBy: p.userId ?? null,
      ...(p.createdAt ? { createdAt: p.createdAt } : {}),
    })
    .returning({ id: inventoryMovementsTable.id });

  return { movementId: movement.id, balanceAfter: newQty };
}
