---
name: Notification dedupe
description: How per-user notifications avoid duplicates and re-fire after being read.
---

# Notification dedupe (active-key partial unique index)

Per-user notifications carry a `dedupeKey` (e.g. `LOW_STOCK:<variantId>:<warehouseId>`,
`NEGATIVE_TREASURY:<accountId>`, `CUSTOMER_DEBT:<id>`, `SUPPLIER_DEBT:<id>`). The refresh
endpoint recomputes alerts and inserts only the missing ones.

**Rule:** dedupe is enforced at the DB level by a *partial* unique index on
`(userId, dedupeKey) WHERE is_read = false AND dedupe_key IS NOT NULL`, and the refresh
insert uses `.onConflictDoNothing()`. The select-then-filter in app code is just an
optimization, not the guarantee.

**Why:** a plain select-then-insert has a race window — two concurrent refresh calls from
the same user could both insert the same active alert. The partial index closes that window.
Scoping it to `is_read = false` is deliberate: once the user reads/clears a notification the
key frees up, so the same condition (e.g. stock still low next week) can re-fire instead of
being permanently suppressed.

**How to apply:** when adding a new notification type, give it a stable `dedupeKey` and rely
on the index + `onConflictDoNothing` rather than only the in-memory `seen` set. Don't make
the index unconditional — that would suppress legitimate re-fires after a notification is read.
