/**
 * Rule engine tests — deterministic priority buckets, view slicing,
 * daily digest, and status handling.
 */

import { describe, expect, it } from 'vitest';
import { buildDigest, enrich, eventsOverdue, eventsToday, eventsUpcoming, priorityFor } from '../src/rules.js';
import { DEFAULT_SETTINGS } from '../src/types.js';
import type { CalEvent, EventMark, Settings } from '../src/types.js';

const settings: Settings = { ...DEFAULT_SETTINGS };
// Fixed "now": 2026-11-11 09:00 Adelaide (ACDT) = 2026-11-10 22:30 UTC
const NOW = new Date('2026-11-10T22:30:00Z').getTime();

function ev(id: string, summary: string, startMs: number, _category: EventMark['category'] = 'other', _status: EventMark['status'] = 'not_started'): CalEvent {
  return { id, uid: id, summary, startMs, endMs: startMs + 3600000, allDay: false, cancelled: false };
}

/** Build a marks record matching the categories the events were created with. */
function marksFor(events: CalEvent[], categories: Record<string, EventMark['category']>): Record<string, EventMark> {
  return Object.fromEntries(
    events.map((e) => [e.id, { category: categories[e.id] ?? 'other', status: 'not_started' }]),
  );
}

describe('priorityFor (deadline categories only)', () => {
  const mark: EventMark = { category: 'assignment', status: 'not_started' };

  it('past deadline -> overdue', () => {
    const e = ev('x', 'Essay', NOW - 3600000);
    expect(priorityFor(e, mark, settings, NOW)).toBe('overdue');
  });

  it('within 24h -> urgent', () => {
    expect(priorityFor(ev('x', 'Quiz', NOW + 3 * 3600000), mark, settings, NOW)).toBe('urgent');
  });

  it('within 72h -> high', () => {
    expect(priorityFor(ev('x', 'Quiz', NOW + 48 * 3600000), mark, settings, NOW)).toBe('high');
  });

  it('within 7d -> upcoming', () => {
    expect(priorityFor(ev('x', 'Quiz', NOW + 6 * 86400000), mark, settings, NOW)).toBe('upcoming');
  });

  it('beyond 7d -> later', () => {
    expect(priorityFor(ev('x', 'Quiz', NOW + 20 * 86400000), mark, settings, NOW)).toBe('later');
  });

  it('does NOT apply priorities to unclassified/class events — we never guess', () => {
    for (const cat of ['other', 'class'] as const) {
      const e = ev('x', 'Lecture', NOW + 60000, cat);
      expect(priorityFor(e, { category: cat, status: 'not_started' }, settings, NOW)).toBeUndefined();
    }
  });

  it('completed deadlines are not overdue anymore', () => {
    const e = ev('x', 'Essay', NOW - 86400000, 'assignment', 'completed');
    expect(eventsOverdue([enrich([e], { [e.id]: { category: 'assignment', status: 'completed' } }, settings, NOW).find((x) => x.event.id === 'x')!], NOW)).toHaveLength(0);
  });
});

describe('view slicing', () => {
  const events = [
    ev('today-1', 'CS101 Lecture', NOW + 2 * 3600000, 'class'),
    ev('today-2', 'Quiz 3', NOW + 5 * 3600000, 'quiz'),
    ev('tmrw', 'Essay due', NOW + 86400000, 'assignment'),
    ev('next-week', 'Exam', NOW + 6 * 86400000, 'exam'),
    ev('far', 'Conference', NOW + 30 * 86400000, 'other'),
    ev('past', 'Old assignment', NOW - 3 * 86400000, 'assignment'),
  ];
  const marks = marksFor(events, {
    'today-1': 'class', 'today-2': 'quiz', 'tmrw': 'assignment', 'next-week': 'exam', 'past': 'assignment',
  });
  const enr = enrich(events, marks, settings, NOW);

  it('Today: Adelaide timezone, local day matching', () => {
    const today = eventsToday(enr, 'Australia/Adelaide', NOW);
    expect(today.map((e) => e.event.id)).toEqual(['today-1', 'today-2']);
  });

  it('Upcoming: 7-day window excludes today and the past', () => {
    const up = eventsUpcoming(enr, 'Australia/Adelaide', NOW);
    expect(up.map((e) => e.event.id)).toEqual(['tmrw', 'next-week']);
  });

  it('Overdue: only deadline categories, excludes completed', () => {
    const od = eventsOverdue(enr, NOW);
    expect(od.map((e) => e.event.id)).toEqual(['past']);
  });

  it('respects user-configured thresholds', () => {
    const custom = { ...settings, urgentHours: 1, highHours: 2, soonDays: 3 };
    expect(priorityFor(ev('x', 'Q', NOW + 90 * 60000), { category: 'quiz', status: 'not_started' }, custom, NOW)).toBe('high');
    expect(priorityFor(ev('x', 'Q', NOW + 50 * 3600000), { category: 'quiz', status: 'not_started' }, custom, NOW)).toBe('upcoming');
    expect(priorityFor(ev('x', 'Q', NOW + 96 * 3600000), { category: 'quiz', status: 'not_started' }, custom, NOW)).toBe('later');
  });
});

describe('buildDigest', () => {
  const events = [
    ev('past', 'Old assignment', NOW - 3 * 86400000, 'assignment'),
    ev('today', 'Quiz 3', NOW + 5 * 3600000, 'quiz'),
    ev('soon', 'Essay', NOW + 2 * 86400000, 'assignment'),
  ];
  const marks = marksFor(events, { past: 'assignment', today: 'quiz', soon: 'assignment' });

  it('produces a deterministic, copyable English digest', () => {
    const d1 = buildDigest(events, marks, settings, NOW, 'en');
    const d2 = buildDigest(events, marks, settings, NOW, 'en');
    expect(d1.text).toBe(d2.text);
    expect(d1.text).toContain('Overdue (1)');
    expect(d1.text).toContain('Old assignment');
    expect(d1.text).toContain('Today (1)');
    expect(d1.text).toContain('[Quiz] Quiz 3');
    expect(d1.text).toContain('Deadlines in the next 7 days (1)');
    expect(d1.text).toContain('no AI');
  });

  it('produces a Chinese digest', () => {
    const d = buildDigest(events, marks, settings, NOW, 'zh-CN');
    expect(d.text).toContain('每日学习摘要');
    expect(d.text).toContain('已逾期 (1)');
    expect(d.text).toContain('[测验] Quiz 3');
  });
});
