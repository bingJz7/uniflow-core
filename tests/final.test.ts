/**
 * Final release-gate tests — fixes from the v0.1.1 final review.
 *  Fix 1: kept-visible events can be archived / marked cancelled by the student.
 *  Fix 2: STATUS:CANCELLED events are visible but never generate urgent reminders.
 *  Fix 3: legacy UID migration no longer assumes `:` / `/` are reserved.
 * All data fictional.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
});

import {
  loadArchived, loadKept, migrateLegacyMarks, parseScopedEventId, resolveKept,
} from '../src/storage.js';
import { parseICS } from '../src/ics-parser.js';
import {
  buildDigest, enrich, eventsOverdue, eventsToday, eventsUpcoming, pendingOnly, priorityFor,
} from '../src/rules.js';
import type { CalEvent, EventMark, Settings } from '../src/types.js';
import { DEFAULT_SETTINGS } from '../src/types.js';

const ADELAIDE = 'Australia/Adelaide';
const settings: Settings = { ...DEFAULT_SETTINGS, timezone: ADELAIDE };

beforeEach(() => store.clear());

function ics(events: string): string {
  return `BEGIN:VCALENDAR\nVERSION:2.0\n${events}\nEND:VCALENDAR`;
}

function ev(id: string, summary: string, startMs: number, extra: Partial<CalEvent> = {}): CalEvent {
  return { id, uid: id, summary, startMs, endMs: startMs + 3600000, allDay: false, cancelled: false, ...extra };
}

// ---------- Fix 1: kept-visible management ----------

describe('Fix 1: kept-visible events can be ended by the student', () => {
  const id = 'src-a:e1@test/single';
  const summary = 'Essay 2';

  function keptFixture() {
    const kept: Record<string, import('../src/types.js').VanishedEvent> = {
      [id]: {
        id, sourceId: 'src-a', sourceName: 'Course A',
        event: ev('e1@test/single', summary, Date.UTC(2026, 10, 5, 6, 30)),
        mark: { category: 'assignment', status: 'in_progress' },
        detectedAt: '2026-11-11T00:00:00Z',
        resolution: 'restored', restoredAt: '2026-11-12T00:00:00Z',
      },
    };
    return kept;
  }

  it('resolveKept(archived) empties the kept store and archives the snapshot with its mark', () => {
    const kept = keptFixture();
    const res = resolveKept(kept, id, 'archived');
    expect(Object.keys(res.kept)).toHaveLength(0);
    const arch = res.archived[id];
    expect(arch).toBeDefined();
    expect(arch.resolution).toBe('archived');
    expect(arch.resolvedAt).toBeTruthy();
    // the student's mark travels with the snapshot — no data loss
    expect(arch.mark).toEqual({ category: 'assignment', status: 'in_progress' });
    expect(arch.event.summary).toBe(summary);
    // persisted to storage
    expect(loadKept()[id]).toBeUndefined();
    expect(loadArchived()[id]).toBeDefined();
  });

  it('resolveKept(cancelled) records the cancellation resolution', () => {
    const res = resolveKept(keptFixture(), id, 'cancelled');
    expect(res.archived[id].resolution).toBe('cancelled');
    expect(loadKept()[id]).toBeUndefined();
    expect(loadArchived()[id].resolution).toBe('cancelled');
  });

  it('archiving uses the CURRENT mark, not the stale vanish-time mark', () => {
    // student re-categorised the kept event to exam/completed while kept-visible
    const res = resolveKept(keptFixture(), id, 'archived', { category: 'exam', status: 'completed' });
    expect(res.archived[id].mark).toEqual({ category: 'exam', status: 'completed' });
    expect(loadArchived()[id].mark).toEqual({ category: 'exam', status: 'completed' });
    // without a currentMark the snapshot mark is kept (backwards compatible)
    const res2 = resolveKept(keptFixture(), id, 'archived');
    expect(res2.archived[id].mark).toEqual({ category: 'assignment', status: 'in_progress' });
  });

  it('resolveKept on an unknown id is a no-op (never fabricates archive entries)', () => {
    const kept = keptFixture();
    const res = resolveKept(kept, 'src-a:ghost/single', 'archived');
    expect(res.kept).toBe(kept);
    expect(loadArchived()['src-a:ghost/single']).toBeUndefined();
  });

  it('an archived kept event stops rendering in every view (allEvents-equivalent pipeline)', () => {
    const events = [ev(id, summary, Date.UTC(2026, 10, 5, 6, 30), { unconfirmed: true })];
    const marks: Record<string, EventMark> = { [id]: { category: 'assignment', status: 'in_progress' } };
    const now = Date.UTC(2026, 10, 6);
    // before: visible in All and Overdue
    expect(eventsOverdue(enrich(events, marks, settings, now), now)).toHaveLength(1);
    // after: the record is gone from the pipeline entirely (kept store empty)
    const res = resolveKept(keptFixture(), id, 'archived');
    expect(Object.keys(res.kept)).toHaveLength(0);
    expect(loadKept()[id]).toBeUndefined();
  });
});

// ---------- Fix 2: STATUS:CANCELLED visibility ----------

describe('Fix 2: cancelled events are visible but never urgent DDL', () => {
  const NOW = Date.UTC(2026, 11, 1, 3, 0); // 1 Dec 2026 13:30 ACDT
  const mark: EventMark = { category: 'assignment', status: 'not_started' };

  it('enrich no longer filters cancelled events out', () => {
    const cancelled = ev('c@x/single', 'Cancelled Quiz', NOW - 86400000, { cancelled: true });
    const enr = enrich([cancelled], { 'c@x/single': mark }, settings, NOW);
    expect(enr).toHaveLength(1);
    expect(enr[0].event.cancelled).toBe(true);
  });

  it('a cancelled OVERDUE assignment gets NO priority — no overdue/urgent reminder', () => {
    const cancelled = ev('c@x/single', 'Cancelled Essay', NOW - 7 * 86400000, { cancelled: true });
    expect(priorityFor(cancelled, mark, settings, NOW)).toBeUndefined();
    const enr = enrich([cancelled], { 'c@x/single': mark }, settings, NOW);
    expect(enr[0].priority).toBeUndefined();
    // and it never lands in the Overdue view
    expect(eventsOverdue(enr, NOW)).toHaveLength(0);
  });

  it('a cancelled URGENT (near-future) assignment also gets no priority', () => {
    const cancelled = ev('c@x/single', 'Cancelled Quiz', NOW + 2 * 3600000, { cancelled: true });
    expect(priorityFor(cancelled, mark, settings, NOW)).toBeUndefined();
  });

  it('the same event WITHOUT cancellation is still overdue (control)', () => {
    const normal = ev('c@x/single', 'Overdue Essay', NOW - 7 * 86400000, { cancelled: false });
    expect(priorityFor(normal, mark, settings, NOW)).toBe('overdue');
  });

  it('cancelled events are excluded from pendingOnly (not pending work)', () => {
    const enr = enrich(
      [ev('c@x/single', 'Cancelled Essay', NOW - 86400000, { cancelled: true })],
      { 'c@x/single': mark }, settings, NOW,
    );
    expect(pendingOnly(enr)).toHaveLength(0);
  });

  it('digest: overdue section excludes cancelled; today section annotates [CANCELLED]', () => {
    const cancelledOverdue = ev('c@x/single', 'Cancelled Essay', NOW - 86400000, { cancelled: true });
    const cancelledToday = ev('d@x/single', 'Cancelled Lecture', NOW + 3600000, { cancelled: true });
    const normalOverdue = ev('n@x/single', 'Real Overdue Essay', NOW - 2 * 86400000, { cancelled: false });
    const digest = buildDigest(
      [cancelledOverdue, cancelledToday, normalOverdue],
      { 'c@x/single': mark, 'd@x/single': { category: 'class', status: 'not_started' }, 'n@x/single': mark },
      settings, NOW, 'en',
    );
    // cancelled overdue never appears in the Overdue section
    expect(digest.text).not.toContain('Cancelled Essay — due');
    // real overdue still does
    expect(digest.text).toContain('Real Overdue Essay');
    // cancelled today-item is visible, explicitly annotated
    expect(digest.text).toContain('Cancelled Lecture');
    expect(digest.text).toContain('[CANCELLED]');
  });

  it('digest (zh-CN): annotates 已取消', () => {
    const cancelledToday = ev('d@x/single', '取消的课', NOW + 3600000, { cancelled: true });
    const digest = buildDigest([cancelledToday], { 'd@x/single': { category: 'class', status: 'not_started' } }, settings, NOW, 'zh-CN');
    expect(digest.text).toContain('取消的课');
    expect(digest.text).toContain('已取消');
  });

  it('cancelled events stay OUT of Today/Upcoming planning views (main.ts filters them)', () => {
    // mirrors renderEventLists(): planning = enriched minus unconfirmed minus cancelled
    const cancelled = ev('c@x/single', 'Cancelled Lecture', NOW + 3600000, { cancelled: true });
    const enrichedAll = enrich([cancelled], {}, settings, NOW);
    const planning = enrichedAll.filter((e) => !e.event.unconfirmed && !e.event.cancelled);
    expect(eventsToday(planning, ADELAIDE, NOW)).toHaveLength(0);
    expect(eventsUpcoming(planning, ADELAIDE, NOW, 7)).toHaveLength(0);
  });
});

// ---------- Fix 3: legacy UID migration hardening ----------

describe('Fix 3: migration is safe for UIDs containing ":" and "/"', () => {
  const liveBySource = (entries: Array<[string, string[]]>) =>
    new Map(entries.map(([srcId, restIds]) => [srcId, new Set(restIds)]));

  it('legacy key with a colon UID migrates to the correct scoped key (no misparse)', () => {
    // UID `team:x@u` → parser rest-id `team:x@u/single`; the legacy mark key is
    // IDENTICAL to a scoped-looking id, but `team` is not a real source id.
    const marks = migrateLegacyMarks(
      { 'team:x@u/single': { category: 'assignment', status: 'in_progress' } },
      liveBySource([['src-x', ['team:x@u/single']]]),
    );
    expect(marks['src-x:team:x@u/single']).toEqual({ category: 'assignment', status: 'in_progress' });
    expect(marks['team:x@u/single']).toBeUndefined(); // legacy key consumed
    expect(marks['team:x@u/single'.slice(0)]).toBeUndefined();
  });

  it('legacy key with a slash UID migrates without corrupting the uid/instance split', () => {
    // UID `cal/dept@u` — the old code split at '/' and produced the WRONG key
    // `src-x:cal/dept@u` (instance 'dept@u'), which never matched a live event.
    const marks = migrateLegacyMarks(
      { 'cal/dept@u/single': { category: 'exam', status: 'completed' } },
      liveBySource([['src-x', ['cal/dept@u/single']]]),
    );
    expect(marks['src-x:cal/dept@u/single']).toEqual({ category: 'exam', status: 'completed' });
  });

  it('legacy recurring key with colon+slash UID (uid/occurrenceMs) round-trips', () => {
    const rest = 'courses:math/dept@u/1731141600000';
    const marks = migrateLegacyMarks(
      { [rest]: { category: 'quiz', status: 'in_progress' } },
      liveBySource([['src-w', [rest]]]),
    );
    expect(marks[`src-w:${rest}`]).toEqual({ category: 'quiz', status: 'in_progress' });
  });

  it('NO false match: a legacy key never matches a different uid that shares a fragment', () => {
    // `a:b/single` must not match uid `a` (rest `a/single`) or uid `b` (rest `b/single`)
    const marks = migrateLegacyMarks(
      { 'a:b/single': { category: 'other', status: 'not_started' } },
      liveBySource([['src-x', ['a/single', 'b/single']]]),
    );
    expect(marks['src-x:a/single']).toBeUndefined();
    expect(marks['src-x:b/single']).toBeUndefined();
    expect(marks['src-x:a:b/single']).toBeUndefined();
    // unresolvable legacy data is kept, not destroyed
    expect(marks['a:b/single']).toEqual({ category: 'other', status: 'not_started' });
  });

  it('a scoped key for a REAL source id still passes through untouched', () => {
    const marks = migrateLegacyMarks(
      { 'src-x:a1@test/single': { category: 'quiz', status: 'completed' } },
      liveBySource([['src-x', ['a1@test/single']]]),
    );
    expect(marks['src-x:a1@test/single']).toEqual({ category: 'quiz', status: 'completed' });
  });

  it('parseScopedEventId honours knownSourceIds (colon UID is not a source prefix)', () => {
    const known = new Set(['src-x']);
    expect(parseScopedEventId('team:x@u/single', known)).toEqual({ sourceId: null, rest: 'team:x@u/single' });
    expect(parseScopedEventId('src-x:a1@test/single', known)).toEqual({ sourceId: 'src-x', rest: 'a1@test/single' });
    // backwards-compatible behaviour without the set
    expect(parseScopedEventId('team:x@u/single')).toEqual({ sourceId: 'team', rest: 'x@u/single' });
  });

  it('END-TO-END v0.1.0: colon/slash UIDs migrate category+status from a real parsed calendar', () => {
    // Real v0.1.0 flow: parse the calendar, seed marks with the parser's bare ids.
    const cal = ics(`BEGIN:VEVENT
UID:team:dept/spring-2026@university.example
DTSTAMP:20261101T000000Z
SUMMARY:Group Project Pitch
DTSTART;TZID=Australia/Adelaide:20261120T170000
END:VEVENT`);
    const restIds = new Set(parseICS(cal, ADELAIDE).events.map((e) => e.id));
    const rest = [...restIds][0];
    expect(rest).toBe('team:dept/spring-2026@university.example/single');

    const marks = migrateLegacyMarks(
      { [rest]: { category: 'assignment', status: 'in_progress' } },
      new Map([['src-live', restIds]]),
    );
    const migrated = marks[`src-live:${rest}`];
    expect(migrated).toBeDefined();
    expect(migrated!.category).toBe('assignment');
    expect(migrated!.status).toBe('in_progress');
    // and the enriched view actually uses the migrated mark
    const scoped = parseICS(cal, ADELAIDE).events.map((e) => ({ ...e, id: `src-live:${e.id}` }));
    const enr = enrich(scoped, marks, settings, Date.UTC(2026, 10, 15));
    expect(enr[0].category).toBe('assignment');
    expect(enr[0].status).toBe('in_progress');
  });

  it('multi-calendar: colon UID legacy key maps into EVERY source containing it', () => {
    const rest = 'team:x@u/single';
    const marks = migrateLegacyMarks(
      { [rest]: { category: 'class', status: 'not_started' } },
      liveBySource([['src-a', [rest]], ['src-b', [rest]]]),
    );
    expect(marks[`src-a:${rest}`]).toEqual({ category: 'class', status: 'not_started' });
    expect(marks[`src-b:${rest}`]).toEqual({ category: 'class', status: 'not_started' });
    expect(marks[rest]).toBeUndefined();
  });
});
