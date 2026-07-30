import { eq } from "drizzle-orm";
import { db, storeSettingsTable } from "@workspace/db";

// Simple in-memory cache per store to avoid hitting DB on every request.
// TTL: 60 seconds. Invalidated explicitly when settings are updated.
const shiftHourCache = new Map<string, { hour: number; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

/** Returns the configured shift start hour (0–23) for the given store. */
export async function getShiftStartHour(storeId: string): Promise<number> {
  const cached = shiftHourCache.get(storeId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.hour;
  }

  const [row] = await db
    .select({ shiftStartHour: storeSettingsTable.shiftStartHour })
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.storeId, storeId))
    .limit(1);

  const hour = row?.shiftStartHour ?? 11;
  shiftHourCache.set(storeId, { hour, expiresAt: Date.now() + CACHE_TTL_MS });
  return hour;
}

/** Invalidates the cached shift hour for a store (call after settings update). */
export function invalidateShiftHourCache(storeId: string): void {
  shiftHourCache.delete(storeId);
}

/**
 * Returns the start of the current operational day.
 *
 * Operational day boundaries work like this:
 *   - If shiftStartHour = 11: the operational day runs from 11:00:00 today
 *     to 10:59:59 the next calendar day.
 *   - Any time before shiftStartHour belongs to the *previous* operational day.
 *
 * @param shiftStartHour  Hour (0–23) at which the operational day starts.
 * @param now             Optional: override current time (useful for tests).
 */
export function computeShiftStart(shiftStartHour: number, now?: Date): Date {
  const d = now ? new Date(now) : new Date();
  if (d.getHours() < shiftStartHour) {
    // We're in the "tail" of the previous operational day — step back one calendar day
    d.setDate(d.getDate() - 1);
  }
  d.setHours(shiftStartHour, 0, 0, 0);
  return d;
}

/**
 * Returns the end (exclusive) of the current operational day.
 * This is shiftStartHour on the next calendar day, minus 1 ms.
 */
export function computeShiftEnd(shiftStartHour: number, now?: Date): Date {
  const start = computeShiftStart(shiftStartHour, now);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return end;
}

/**
 * Returns whether a given timestamp falls in the current operational day.
 */
export function isInCurrentShift(shiftStartHour: number, ts: Date, now?: Date): boolean {
  const start = computeShiftStart(shiftStartHour, now);
  const end = computeShiftEnd(shiftStartHour, now);
  return ts >= start && ts <= end;
}

/**
 * Builds an array of {start, end} Date pairs for the last N operational days.
 * Useful for chart queries that need to GROUP BY operational day.
 *
 * @param shiftStartHour  The shift hour.
 * @param fromDate        Start of the range (will be aligned to shift boundary).
 * @param toDate          End of the range (defaults to end of current op day).
 */
export function buildShiftDayRanges(
  shiftStartHour: number,
  fromDate: Date,
  toDate?: Date,
): Array<{ label: string; start: Date; end: Date }> {
  const to = toDate ?? computeShiftEnd(shiftStartHour, new Date());
  const ranges: Array<{ label: string; start: Date; end: Date }> = [];

  let cursor = computeShiftStart(shiftStartHour, fromDate);
  // If fromDate is after the cursor start, align forward
  if (fromDate > cursor) {
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 1);
  }

  while (cursor <= to) {
    const dayStart = new Date(cursor);
    const dayEnd = new Date(cursor);
    dayEnd.setDate(dayEnd.getDate() + 1);
    dayEnd.setMilliseconds(dayEnd.getMilliseconds() - 1);

    // Label = YYYY-MM-DD of the calendar date the shift belongs to
    const label = dayStart.toISOString().slice(0, 10);
    ranges.push({ label, start: dayStart, end: dayEnd > to ? to : dayEnd });

    cursor = new Date(dayStart);
    cursor.setDate(cursor.getDate() + 1);
  }

  return ranges;
}
