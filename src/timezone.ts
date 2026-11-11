/**
 * Timezone helpers built on Intl — no external tz database needed.
 * Handles: IANA named zones, DST transitions (e.g. Australia/Adelaide), and
 * interpreting naive ("floating") calendar times in a chosen zone.
 */

/** Milliseconds the zone was offset from UTC at the given instant (east positive). */
export function tzOffsetMs(timezone: string, instant: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  // Some ICU builds emit "24" for midnight — normalize.
  const hour = get('hour') % 24;
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return asUTC - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Interpret naive wall-clock fields in `timezone` and return epoch ms.
 * Two-pass to be correct around DST transitions.
 */
export function wallClockToMs(
  timezone: string,
  y: number,
  m: number, // 1-12
  d: number,
  hh: number,
  mm: number,
): number {
  const guess = Date.UTC(y, m - 1, d, hh, mm, 0);
  let epoch = guess - tzOffsetMs(timezone, new Date(guess));
  // Refine once: the offset at the refined instant may differ (DST boundary).
  epoch = guess - tzOffsetMs(timezone, new Date(epoch));
  return epoch;
}

/** Epoch ms -> {y,m,d,hh,mm} in the given timezone. */
export function msToWallClock(timezone: string, ms: number): { y: number; m: number; d: number; hh: number; mm: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  return { y: get('year'), m: get('month'), d: get('day'), hh: get('hour') % 24, mm: get('minute') };
}

/** Civil-date comparison in a timezone: same local day? */
export function sameLocalDay(timezone: string, ms: number, refMs: number): boolean {
  const a = msToWallClock(timezone, ms);
  const b = msToWallClock(timezone, refMs);
  return a.y === b.y && a.m === b.m && a.d === b.d;
}

/** Days from refMs's local day to ms's local day (negative = past). */
export function dayDiff(timezone: string, ms: number, refMs: number): number {
  const a = msToWallClock(timezone, ms);
  const b = msToWallClock(timezone, refMs);
  const utcA = Date.UTC(a.y, a.m - 1, a.d);
  const utcB = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((utcA - utcB) / 86400000);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Human countdown like "2d 4h" / "3h 15m" / "12m". */
export function countdown(msRemaining: number, lang: 'en' | 'zh-CN'): string {
  if (msRemaining < 0) return lang === 'zh-CN' ? '已过期' : 'overdue';
  const mins = Math.floor(msRemaining / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return lang === 'zh-CN' ? `${d}天${h}小时` : `${d}d ${h}h`;
  if (h > 0) return lang === 'zh-CN' ? `${h}小时${m}分` : `${h}h ${m}m`;
  return lang === 'zh-CN' ? `${m}分钟` : `${m}m`;
}
