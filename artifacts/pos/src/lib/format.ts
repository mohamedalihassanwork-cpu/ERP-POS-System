const dateTimeFormatter = new Intl.DateTimeFormat("ar-EG", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("ar-EG", {
  hour: "2-digit",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat("ar-EG", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

// Shift cutoff offset: 11 hours (11:00 AM)
const SHIFT_OFFSET_MS = 11 * 60 * 60 * 1000;

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  // Subtract 11 hours so that times between 00:00 and 10:59 map to the active shift date
  const shiftDate = new Date(date.getTime() - SHIFT_OFFSET_MS);
  const dateStr = dateTimeFormatter.format(shiftDate);
  const timeStr = timeFormatter.format(date);
  return `${dateStr} - ${timeStr}`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const shiftDate = new Date(date.getTime() - SHIFT_OFFSET_MS);
  return dateFormatter.format(shiftDate);
}
