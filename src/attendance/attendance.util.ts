/**
 * Date / time helpers for the attendance module.
 *
 * Everything here is timezone-aware on purpose: attendance is anchored to the
 * tenant's own working timezone (`attendance_settings.working_hours.timezone`),
 * not to UTC and not to whatever timezone the server happens to run in.
 */

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/** Distance between two GPS points in meters (haversine). */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function safeTimeZone(timeZone?: string | null): string {
  const tz = timeZone || DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** Wall-clock parts of `date` as seen in `timeZone`. */
export function zonedParts(date: Date, timeZone?: string | null) {
  const tz = safeTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  // Intl reports midnight as "24" in some ICU versions — normalise it.
  const hour = Number(get('hour')) % 24;

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour,
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: weekdayMap[get('weekday')] ?? 0,
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

/** `YYYY-MM-DD` for the given instant in the tenant's timezone. */
export function zonedDateStr(date: Date, timeZone?: string | null): string {
  return zonedParts(date, timeZone).dateStr;
}

/** Minutes elapsed since local midnight in the tenant's timezone. */
export function zonedMinutesOfDay(date: Date, timeZone?: string | null): number {
  const { hour, minute } = zonedParts(date, timeZone);
  return hour * 60 + minute;
}

/** Day of week (0 = Sunday) in the tenant's timezone. */
export function zonedWeekday(date: Date, timeZone?: string | null): number {
  return zonedParts(date, timeZone).weekday;
}

/**
 * The UTC instant at which the wall clock in `timeZone` reads `dateStr` + `minutesOfDay`.
 *
 * Converges by measuring the zone's actual offset at a first guess and correcting;
 * the second pass settles the DST-boundary case where the correction itself crosses
 * a transition.
 */
export function zonedTimeToUtc(dateStr: string, minutesOfDay: number, timeZone?: string | null): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const hour = Math.floor(minutesOfDay / 60);
  const minute = minutesOfDay % 60;
  const desired = Date.UTC(year, month - 1, day, hour, minute);

  let timestamp = desired;
  for (let i = 0; i < 2; i += 1) {
    const parts = zonedParts(new Date(timestamp), timeZone);
    const actual = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    const drift = desired - actual;
    if (drift === 0) break;
    timestamp += drift;
  }

  return new Date(timestamp);
}

/** Parses `"HH:mm"` into minutes since midnight. Returns null when unparseable. */
export function parseClockTime(value?: string | null): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** True when `value` is a real calendar date in `YYYY-MM-DD` form. */
export function isValidDateStr(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return (
    parsed.getUTCFullYear() === y &&
    parsed.getUTCMonth() === m - 1 &&
    parsed.getUTCDate() === d
  );
}

/**
 * First and last calendar day of a `YYYY-MM` month.
 * Guards against the old `${month}-31` bug, which produced dates such as
 * `2026-04-31` and made Postgres reject the query outright.
 */
export function monthRange(month: string): { startDate: string; endDate: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error('Invalid month format, expected YYYY-MM');

  const year = Number(match[1]);
  const monthNum = Number(match[2]);
  if (monthNum < 1 || monthNum > 12) throw new Error('Invalid month, expected 01-12');

  // Day 0 of the next month is the last day of this one.
  const lastDay = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  return {
    startDate: `${match[1]}-${match[2]}-01`,
    endDate: `${match[1]}-${match[2]}-${String(lastDay).padStart(2, '0')}`,
  };
}

/** Inclusive list of `YYYY-MM-DD` strings between two dates, computed in UTC so DST can't shift it. */
export function eachDateInRange(startDate: string, endDate: string): string[] {
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);

  const dates: string[] = [];
  const cursor = new Date(Date.UTC(sy, sm - 1, sd));
  const last = new Date(Date.UTC(ey, em - 1, ed));

  while (cursor <= last) {
    dates.push(cursor.toISOString().split('T')[0]);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/** Whole days covered by an inclusive date range. */
export function countDaysInclusive(startDate: string, endDate: string): number {
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const diff = Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd);
  return Math.floor(diff / 86400000) + 1;
}
