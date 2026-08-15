/** ISO yyyy-mm-dd for "now". Stable during a render. */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** ISO yyyy-mm-dd for `days` ago, anchored to local midnight. */
export function isoDaysAgo(days: number, now: Date = new Date()): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Render an ISO timestamp as HH:MM (locale-aware). Returns '—' for null/invalid. */
export function formatClockTime(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

/** True iff the ISO timestamp's date (yyyy-mm-dd) equals the given `todayIso`. */
export function isToday(iso: string, today: string): boolean {
  if (!iso) return false;
  try {
    return new Date(iso).toISOString().slice(0, 10) === today;
  } catch {
    return false;
  }
}

/** Date-range filter used by reports. */
export type DateRange = 'today' | 'week';

export function isInDateRange(iso: string, range: DateRange, today: string): boolean {
  if (!iso) return false;
  let day: string;
  try {
    day = new Date(iso).toISOString().slice(0, 10);
  } catch {
    return false;
  }
  if (range === 'today') return day === today;
  const cutoff = isoDaysAgo(6, new Date(today));
  return day >= cutoff && day <= today;
}

/** Filter a list of items by `isToday` against `isoKey`. */
export function filterToday<T>(items: T[], isoKey: (item: T) => string | undefined, today: string): T[] {
  return items.filter((item) => isToday(isoKey(item) ?? '', today));
}