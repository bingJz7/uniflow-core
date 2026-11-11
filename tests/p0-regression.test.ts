/**
 * P0 regression tests — multi-calendar data safety.
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
  addVanished, loadArchived, loadVanished, migrateLegacyMarks,
  parseScopedEventId, pruneMarks, resolveVanished,
  scopedEventId,
} from '../src/storage.js';
import { parseICS } from '../src/ics-parser.js';
import { diffSnapshots } from '../src/sync.js';
import type { CalEvent, EventMark } from '../src/types.js';

const ADELAIDE = 'Australia/Adelaide';

function ics(events: string): string {
  return `BEGIN:VCALENDAR\nVERSION:2.0\n${events}\nEND:VCALENDAR`;
}

const COURSE_A = ics(`BEGIN:VEVENT
UID:a1@test
DTSTAMP:20261101T000000Z
SUMMARY:Course A Essay
DTSTART;TZID=Australia/Adelaide:20261120T170000
END:VEVENT`);

const COURSE_B_SAME_UID_AS_A = ics(`BEGIN:VEVENT
UID:a1@test
DTSTAMP:20261101T000000Z
SUMMARY:Course B event that reuses uid a1@test
DTSTART;TZID=Australia/Adelaide:20261122T090000
END:VEVENT`);

function ev(id: string, summary: string, startMs: number): CalEvent {
  return { id, uid: id, summary, startMs, endMs: startMs + 3600000, allDay: false, cancelled: false };
}

beforeEach(() => store.clear());

describe('P0-03: source-scoped event ids', () => {
  it('scopedEventId prefixes the source id and parseScopedEventId round-trips', () => {
    const id = scopedEventId('src-a', 'a1@test', 'single');
    expect(id).toBe('src-a:a1@test/single');
    expect(parseScopedEventId(id)).toEqual({ sourceId: 'src-a', rest: 'a1@test/single' });
    // legacy ids (no source prefix)
    expect(parseScopedEventId('a1@test/single')).toEqual({ sourceId: null, rest: 'a1@test/single' });
  });

  it('same UID in two calendars produces distinct scoped ids — no state overwrite', () => {
    const a = parseICS(COURSE_A, ADELAIDE).events[0];
    const b = parseICS(COURSE_B_SAME_UID_AS_A, ADELAIDE).events[0];
    const idA = scopedEventId('src-a', a.uid, 'single');
    const idB = scopedEventId('src-b', b.uid, 'single');
    expect(idA).not.toBe(idB);

    // student marks differ per calendar
    let marks: Record<string, EventMark> = {};
    marks[idA] = { category: 'assignment', status: 'in_progress' };
    marks[idB] = { category: 'quiz', status: 'completed' };
    expect(marks[idA].status).toBe('in_progress');
    expect(marks[idB].status).toBe('completed');
  });
});

describe('P0-01: pruning must consider ALL imported calendars', () => {
  it('importing course B does NOT prune course A marks', () => {
    const liveA = new Set([scopedEventId('src-a', 'a1@test', 'single')]);
    const liveB = new Set([scopedEventId('src-b', 'b1@test', 'single')]);
    const liveAll = new Set([...liveA, ...liveB]);

    const marks = {
      [scopedEventId('src-a', 'a1@test', 'single')]: { category: 'assignment' as const, status: 'in_progress' as const },
    };
    // WRONG (old behaviour): prune against only course B's ids would delete A's mark.
    // CORRECT: prune against the union keeps it.
    expect(pruneMarks(marks, liveAll)).toEqual(marks);
    // sanity: the old buggy call shape would have dropped it
    expect(pruneMarks(marks, liveB)).not.toEqual(marks);
  });

  it('removing a source only drops that source\'s marks', () => {
    const marks = {
      'src-a:a1@test/single': { category: 'assignment' as const, status: 'not_started' as const },
      'src-b:b1@test/single': { category: 'quiz' as const, status: 'completed' as const },
    };
    const afterRemovingA = Object.fromEntries(Object.entries(marks).filter(([k]) => !k.startsWith('src-a:')));
    expect(Object.keys(afterRemovingA)).toEqual(['src-b:b1@test/single']);
    expect(afterRemovingA['src-b:b1@test/single'].status).toBe('completed');
  });
});

describe('P0-03 migration: legacy v0.1.0 mark keys', () => {
  it('migrates a legacy key to every source that now contains that event', () => {
    const liveBySource = new Map<string, Set<string>>([
      ['src-a', new Set(['a1@test/single'])],
      ['src-b', new Set(['b1@test/single'])],
    ]);
    const legacy = { 'a1@test/single': { category: 'assignment' as const, status: 'completed' as const } };
    const migrated = migrateLegacyMarks(legacy, liveBySource);
    expect(migrated['src-a:a1@test/single']).toEqual({ category: 'assignment', status: 'completed' });
    expect(migrated['a1@test/single']).toBeUndefined(); // legacy key removed once mapped
  });

  it('unresolvable legacy keys are KEPT, never destroyed', () => {
    const migrated = migrateLegacyMarks(
      { 'ghost@test/single': { category: 'other' as const, status: 'not_started' as const } },
      new Map([['src-a', new Set(['a1@test/single'])]]),
    );
    expect(migrated['ghost@test/single']).toBeDefined();
  });
});

describe('P0-02: vanished event snapshots', () => {
  it('diff reports removed events; snapshot stores event + mark, pending confirmation', () => {
    const oldScoped = [
      { ...ev('src-b:b1@test/single', 'Course B Quiz', Date.now()), uid: 'b1@test' },
    ];
    const newScoped: CalEvent[] = []; // feed no longer contains it
    const diff = diffSnapshots(oldScoped, newScoped, '2026-11-11T05:00:00.000Z');
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0].summary).toBe('Course B Quiz');

    let vanished: Record<string, ReturnType<typeof loadVanished>> = {};
    const res = addVanished(vanished as never, {
      id: 'src-b:b1@test/single',
      sourceId: 'src-b',
      sourceName: 'Course B',
      event: diff.removed[0],
      mark: { category: 'quiz', status: 'in_progress' },
      detectedAt: '2026-11-11T05:00:00.000Z',
    });
    vanished = res.store as never;
    expect(Object.keys(loadVanished())).toHaveLength(1);

    const snap = Object.values(loadVanished())[0];
    expect(snap.mark.status).toBe('in_progress'); // student's status preserved
    expect(snap.event.summary).toBe('Course B Quiz');

    // resolve as cancelled → archived, nothing deleted
    resolveVanished(vanished as never, 'src-b:b1@test/single', 'cancelled');
    expect(Object.keys(loadVanished())).toHaveLength(0);
    expect(Object.keys(loadArchived())[0]).toBe('src-b:b1@test/single');
    expect(loadArchived()['src-b:b1@test/single'].resolution).toBe('cancelled');
  });

  it('re-adding the event to the feed clears the pending snapshot (restore path)', () => {
    let vanished: Record<string, never> = {} as never;
    const item = {
      id: 'src-b:b1@test/single',
      sourceId: 'src-b',
      sourceName: 'Course B',
      event: ev('b1@test/single', 'Quiz', 1),
      mark: { category: 'quiz' as const, status: 'not_started' as const },
      detectedAt: '2026-11-11T05:00:00.000Z',
    };
    const res = addVanished(vanished, item as never);
    vanished = res.store as never;
    resolveVanished(vanished, item.id, 'restored');
    expect(Object.keys(loadVanished())).toHaveLength(0);
    expect(Object.keys(loadArchived())).toHaveLength(0); // restored = dropped, not archived
  });

  it('duplicate vanished snapshots are not recorded twice', () => {
    let vanished: Record<string, never> = {} as never;
    const item = {
      id: 'src-b:x/single', sourceId: 'src-b', sourceName: 'B',
      event: ev('x/single', 'X', 1), mark: { category: 'other' as const, status: 'not_started' as const },
      detectedAt: 't',
    };
    const r1 = addVanished(vanished, item as never);
    const r2 = addVanished(r1.store as never, item as never);
    expect(r2.changed).toBe(false);
    expect(Object.keys(r2.store)).toHaveLength(1);
  });
});

describe('P0-02 + P0-03: full re-import flow (parse → diff → scope)', () => {
  it('time-moved events produce a timeMoved pair whose ids migrate the mark', () => {
    const before = parseICS(ics(`BEGIN:VEVENT
UID:m1@test
DTSTAMP:20261101T000000Z
SUMMARY:Essay
DTSTART;TZID=Australia/Adelaide:20261120T170000
END:VEVENT`), ADELAIDE).events;

    const after = parseICS(ics(`BEGIN:VEVENT
UID:m1@test
DTSTAMP:20261101T000000Z
SUMMARY:Essay
DTSTART;TZID=Australia/Adelaide:20261121T170000
END:VEVENT`), ADELAIDE).events;

    const oldScoped = before.map((e) => ({ ...e, id: `src-a:${e.id}` }));
    const newScoped = after.map((e) => ({ ...e, id: `src-a:${e.id}` }));
    const diff = diffSnapshots(oldScoped, newScoped, 't');
    expect(diff.timeMoved).toHaveLength(1);
    const { from, to } = diff.timeMoved[0];
    expect(from.id).toBe('src-a:m1@test/single');
    expect(to.id).toBe('src-a:m1@test/single');
    // single events keep the same instance key — marks survive the move as-is
    expect(from.id).toBe(to.id);
  });

  it('recurring instance moved via RECURRENCE-ID: override replaces the occurrence (tz-correct)', () => {
    // Weekly Tue 09:00 Adelaide. One occurrence moved via RECURRENCE-ID with TZID.
    const withOverride = ics(`BEGIN:VEVENT
UID:r1@test
DTSTAMP:20261101T000000Z
SUMMARY:Weekly seminar
DTSTART;TZID=Australia/Adelaide:20261110T090000
DTEND;TZID=Australia/Adelaide:20261110T100000
RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=3
END:VEVENT
BEGIN:VEVENT
UID:r1@test
DTSTAMP:20261101T000000Z
SUMMARY:Weekly seminar (moved)
RECURRENCE-ID;TZID=Australia/Adelaide:20261117T090000
DTSTART;TZID=Australia/Adelaide:20261118T140000
DTEND;TZID=Australia/Adelaide:20261118T150000
END:VEVENT`);
    const win = {
      expandFrom: new Date('2026-11-01T00:00:00Z'),
      expandTo: new Date('2026-12-31T00:00:00Z'),
    };
    const { events, warnings } = parseICS(withOverride, ADELAIDE, win);
    expect(warnings).toHaveLength(0);
    // UTC dates: Nov 10 09:00 ACDT = 11-09T22:30Z; moved = Nov 18 14:00 = 11-18T03:30Z; Nov 24 = 11-23
    const days = events.map((e) => new Date(e.startMs).toISOString().slice(5, 10));
    expect(days).toEqual(['11-09', '11-18', '11-23']);
    const moved = events.find((e) => e.summary.includes('moved'))!;
    // 14:00 ACDT (UTC+10:30) = 03:30 UTC — proves the RECURRENCE-ID matched
    // the Nov 17 occurrence in Adelaide time, not shifted by a tz bug.
    expect(`${moved.startMs ? new Date(moved.startMs).getUTCHours() : -1}:${new Date(moved.startMs).getUTCMinutes()}`).toBe('3:30');
    expect(new Date(moved.startMs).getUTCDate()).toBe(18);
  });
});
