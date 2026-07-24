---
name: POS Phase 2 inventory lessons
description: Non-obvious decisions and codegen quirks from building the Core Inventory module (products/variants, warehouses, cached stock, immutable movements, manual adjustments).
---

## Cached inventory rows: atomic upsert, not select-then-insert
Stock per (variant, warehouse) is a cached row updated by every movement. The first
adjustment for a pair must create the row; do this with a single
`insert(...).onConflictDoUpdate({ target:[variantId,warehouseId], set:{ quantity: sql\`quantity + delta\` } }).returning({quantity})`.

**Why:** a SELECT FOR UPDATE then INSERT races — two concurrent first-time adjustments
for the same pair both see no row and both insert, and one aborts on the unique index
`inventory_items_variant_warehouse_unique`.

**How to apply:** run the negative-stock guard (`newQty < 0` → throw) *after* the upsert,
inside the same transaction, so an over-deduction rolls the whole adjustment back. Same
pattern applies to any future SALE/PURCHASE/TRANSFER movement that mutates cached stock.

## Orval-zod does NOT emit `.int()` for OpenAPI `type: integer`
A spec field `{ type: integer, minimum: 1 }` generates `zod.number().min(1)` — no integer
constraint. Quantities map to integer DB columns, so a float like `1.5` passes codegen
validation and would hit the DB.

**Why:** orval's zod generator ignores the integer format.

**How to apply:** enforce integer-ness in the route handler
(`Number.isInteger(x)` → 400) for any quantity/count field, don't rely on the generated schema.

## Enum-typed query filters need an explicit narrowed variable
Validating an optional enum query param (e.g. movement `type`) against an allowlist with a
custom type guard does NOT narrow if written as a compound early-return
`if (type && !isMovementType(type)) return`. TS keeps it `string`, and drizzle `eq()` on a
pgEnum column then fails to typecheck.

**How to apply:** assign into a separately-typed local
(`let movementType: MovementType | undefined; if (type){ if(!guard) 400; movementType=type }`)
and use that in the query.

## Deferred from Phase 2 (told user, awaiting approval)
Warehouse transfers (paired TRANSFER_OUT/TRANSFER_IN movements) and the full stock-count
session workflow (SRS §9.7) are intentionally NOT built. SALE/PURCHASE movements arrive in
later phases. The movement-type pgEnum already includes all these values.
