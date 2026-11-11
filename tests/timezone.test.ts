/**
 * Timezone tests — including Australia/Adelaide DST transitions,
 * which the product owner explicitly cares about (Adelaide, GMT+9:30/10:30).
 */

import { describe, expect, it } from 'vitest';
import { countdown, dayDiff, isValidTimeZone, msToWallClock, sameLocalDay, wallClockToMs } from '../src/timezone.js';

const ADELAIDE = 'Australia/Adelaide';

describe('wallClockToMs / msToWallClock round trip', () => {
  it('round-trips a normal (ACST, UTC+9:30) winter instant', () => {
    const ms = wallClockToMs(ADELAIDE, 2026, 6, 15, 9, 30);
    const wc = msToWallClock(ADELAIDE, ms);
    expect(wc).toEqual({ y: 2026, m: 6, d: 15, hh: 9, mm: 30 });
    // ACST = UTC+9:30
    expect(new Date(ms).toISOString()).toBe('2026-06-15T00:00:00.000Z');
  });

  it('round-trips a DST (ACDT, UTC+10:30) summer instant', () => {
    const ms = wallClockToMs(ADELAIDE, 2026, 1, 15, 9, 30);
    // 2026-01-15 09:30 ACDT (UTC+10:30) = 2026-01-14 23:00 UTC
    expect(new Date(ms).toISOString()).toBe('2026-01-14T23:00:00.000Z');
    const wc = msToWallClock(ADELAIDE, ms);
    expect(wc).toEqual({ y: 2026, m: 1, d: 15, hh: 9, mm: 30 });
  });

  it('handles the spring DST boundary (clocks jump 1 Oct forward 02:00→03:00)', () => {
    // 02:30 on the transition night does not exist in Adelaide. Per RFC 5545
    // practice, a nonexistent time is interpreted with the offset BEFORE the
    // transition, which after the jump lands at 03:30 local — we assert that
    // deterministic resolution rather than pretending the time exists.
    const ms = wallClockToMs(ADELAIDE, 2026, 10, 4, 2, 30);
    const wc = msToWallClock(ADELAIDE, ms);
    expect(`${wc.d}:${wc.hh}:${wc.mm}`).toBe('4:3:30');
  });

  it('handles the autumn DST boundary (clocks fall back 5 Apr 03:00→02:00)', () => {
    // 02:30 occurs twice; wallClockToMs resolves to the first (earlier) instant.
    const ms = wallClockToMs(ADELAIDE, 2026, 4, 5, 2, 30);
    const wc = msToWallClock(ADELAIDE, ms);
    expect(`${wc.d}:${wc.hh}:${wc.mm}`).toBe('5:2:30');
  });
});

describe('day diff / same day', () => {
  it('same local day = 0, next day = 1, yesterday = -1', () => {
    const ref = wallClockToMs(ADELAIDE, 2026, 11, 12, 12, 0);
    expect(dayDiff(ADELAIDE, wallClockToMs(ADELAIDE, 2026, 11, 12, 23, 59), ref)).toBe(0);
    expect(dayDiff(ADELAIDE, wallClockToMs(ADELAIDE, 2026, 11, 13, 0, 1), ref)).toBe(1);
    expect(dayDiff(ADELAIDE, wallClockToMs(ADELAIDE, 2026, 11, 11, 23, 0), ref)).toBe(-1);
    expect(sameLocalDay(ADELAIDE, wallClockToMs(ADELAIDE, 2026, 11, 12, 23, 59), ref)).toBe(true);
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA zones and rejects junk', () => {
    expect(isValidTimeZone('Australia/Adelaide')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});

describe('countdown', () => {
  it('formats human countdowns', () => {
    expect(countdown(2 * 86400000 + 4 * 3600000, 'en')).toBe('2d 4h');
    expect(countdown(3 * 3600000 + 15 * 60000, 'en')).toBe('3h 15m');
    expect(countdown(12 * 60000, 'en')).toBe('12m');
    expect(countdown(2 * 86400000, 'zh-CN')).toBe('2天0小时');
    expect(countdown(-1000, 'en')).toBe('overdue');
    expect(countdown(-1000, 'zh-CN')).toBe('已过期');
  });
});
