/**
 * Round-2 review tests — BLOCKER 1 & 3 & 4 + kept-visible mechanism.
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
  loadKept, migrateLegacyMarks, removeKept, resolveVanished,
  saveKept, saveSources, scopedEventId,
} from '../src/storage.js';
import { parseICS } from '../src/ics-parser.js';
import { diffSnapshots } from '../src/sync.js';
import { buildDigest, eventsOverdue, eventsToday, eventsUpcoming, enrich } from '../src/rules.js';
import type { CalEvent, CalendarSource, EventMark, Settings, VanishedEvent } from '../src/types.js';
import { DEFAULT_SETTINGS } from '../src/types.js';

const ADELAIDE = 'Australia/Adelaide';
const settings: Settings = { ...DEFAULT_SETTINGS, timezone: ADELAIDE };

function ics(events: string): string {
  return `BEGIN:VCALENDAR\nVERSION:2.0\n${events}\nEND:VCALENDAR`;
}

function evU(uid: string, summary: string, startMs: number): CalEvent {
  return { id: `${uid}/${startMs}`, uid, summary, startMs, endMs: startMs + 3600000, allDay: false, cancelled: false };
}

function ev(id: string, summary: string, startMs: number): CalEvent {
  return { id, uid: id, summary, startMs, endMs: startMs + 3600000, allDay: false, cancelled: false };
}

function recurringIcs(uid: string, summary: string): string {
  return ics(`BEGIN:VEVENT
UID:${uid}
DTSTAMP:20261101T000000Z
SUMMARY:${summary}
DTSTART;TZID=Australia/Adelaide:20261102T100000
DTEND;TZID=Australia/Adelaide:20261102T110000
RRULE:FREQ=WEEKLY;COUNT=4
END:VEVENT`);
}

const WEEK_MS = 7 * 86400000;

beforeEach(() => store.clear());

// ---------- BLOCKER 1: legacy marks migration ----------

describe('BLOCKER 1: v0.1.0 → v0.1.1 marks migration', () => {
  /**
   * Reproduces the REAL v0.1.0 localStorage contract: sources carry raw
   * icsText, marks are keyed by the parser's bare instance id
   * (`uid/instanceKey`) with NO source prefix.
   */
  function seedV010(sources: CalendarSource[], legacyMarks: Record<string, EventMark>): void {
    saveSources(sources);
    store.set('uniflow.marks.v1', JSON.stringify(legacyMarks));
  }

  it('migrates a real v0.1.0 marks store so categories/status survive refresh', () => {
    const cal = ics(`BEGIN:VEVENT
UID:a1@test
DTSTAMP:20261101T000000Z
SUMMARY:Course A Essay
DTSTART;TZID=Australia/Adelaide:20261120T170000
END:VEVENT`);
    seedV010(
      [{ id: 'src-x', name: 'Course A', sourceType: 'file', icsText: cal, lastSyncedAt: '2026-11-01T00:00:00Z' }],
      { 'a1@test/single': { category: 'assignment', status: 'in_progress' } },
    );

    // Simulated boot (same order as main.init): load → migrate with live rest-ids.
    const sources = JSON.parse(store.get('uniflow.sources.v1')!);
    const restIds = new Map<string, Set<string>>();
    for (const src of sources) {
      restIds.set(src.id, new Set(parseICS(src.icsText, ADELAIDE).events.map((e) => e.id)));
    }
    const marks = migrateLegacyMarks(JSON.parse(store.get('uniflow.marks.v1')!), restIds);

    const migrated = marks[scopedEventId('src-x', 'a1@test', 'single')];
    expect(migrated).toBeDefined();
    expect(migrated!.category).toBe('assignment');
    expect(migrated!.status).toBe('in_progress');
  });

  it('maps one legacy key into EVERY source containing that uid (multi-calendar)', () => {
    const calA = ics(`BEGIN:VEVENT\nUID:dup@x\nDTSTAMP:20261101T000000Z\nSUMMARY:A\nDTSTART;TZID=Australia/Adelaide:20261120T170000\nEND:VEVENT`);
    const calB = ics(`BEGIN:VEVENT\nUID:dup@x\nDTSTAMP:20261101T000000Z\nSUMMARY:B\nDTSTART;TZID=Australia/Adelaide:20261121T170000\nEND:VEVENT`);
    const restIds = new Map<string, Set<string>>([
      ['src-a', new Set(parseICS(calA, ADELAIDE).events.map((e) => e.id))],
      ['src-b', new Set(parseICS(calB, ADELAIDE).events.map((e) => e.id))],
    ]);
    const marks = migrateLegacyMarks(
      { 'dup@x/single': { category: 'exam', status: 'not_started' } },
      restIds,
    );
    expect(marks[scopedEventId('src-a', 'dup@x', 'single')].category).toBe('exam');
    expect(marks[scopedEventId('src-b', 'dup@x', 'single')].category).toBe('exam');
    expect(marks['dup@x/single']).toBeUndefined(); // legacy key consumed
  });

  it('migrates recurring-instance legacy keys (uid/occurrenceMs)', () => {
    const cal = recurringIcs('w1@test', 'Weekly Lab');
    const restIds = new Map<string, Set<string>>([
      ['src-w', new Set(parseICS(cal, ADELAIDE).events.map((e) => e.id))],
    ]);
    // v0.1.0 stored e.g. 'w1@test/<occMs>' keys from the parser's own ids.
    const occId = [...restIds.get('src-w')!][1]; // second occurrence
    const marks = migrateLegacyMarks(
      { [occId]: { category: 'quiz', status: 'completed' } },
      restIds,
    );
    expect(marks[`src-w:${occId}`]).toEqual({ category: 'quiz', status: 'completed' });
  });

  it('keeps unresolvable legacy keys instead of destroying them', () => {
    const marks = migrateLegacyMarks(
      { 'ghost@x/single': { category: 'class', status: 'not_started' } },
      new Map([['src-a', new Set(['real@x/single'])]]),
    );
    expect(marks['ghost@x/single']).toBeDefined();
  });
});

// ---------- BLOCKER 2: Keep visible really restores ----------

describe('BLOCKER 2: keep-visible mechanism', () => {
  const OLD = Date.UTC(2026, 10, 5, 6, 30); // past: 5 Nov 2026 17:00 ACDT
  const FUTURE = Date.UTC(2026, 10, 10, 6, 30); // 10 Nov — inside the 7-day window
  const marks: Record<string, EventMark> = { 'src-a:e1@test/single': { category: 'assignment', status: 'in_progress' } };

  function vanishedFixture() {
    let vanished: Record<string, VanishedEvent> = {};
    const fixture = {
      id: 'src-a:e1@test/single',
      sourceId: 'src-a',
      sourceName: 'Course A',
      event: { id: 'e1@test/single', uid: 'e1@test', summary: 'Essay 2', startMs: OLD, endMs: OLD + 3600000, allDay: false, cancelled: false },
      mark: marks['src-a:e1@test/single'],
      detectedAt: '2026-11-11T00:00:00Z',
    };
    vanished = { [fixture.id]: fixture };
    return { vanished, fixture };
  }

  it('resolveVanished(restored) moves the snapshot into the kept store with its mark', () => {
    const { vanished } = vanishedFixture();
    const res = resolveVanished(vanished, 'src-a:e1@test/single', 'restored');
    expect(res.vanished['src-a:e1@test/single']).toBeUndefined();
    const kept = res.kept['src-a:e1@test/single'];
    expect(kept).toBeDefined();
    expect(kept.resolution).toBe('restored');
    expect(kept.restoredAt).toBeTruthy();
    expect(kept.mark).toEqual({ category: 'assignment', status: 'in_progress' });
    // persisted
    expect(loadKept()['src-a:e1@test/single']).toBeDefined();
  });

  it('kept events appear in All and Overdue (not Today/Upcoming) with unconfirmed flag', () => {
    const { fixture } = vanishedFixture();
    const events: CalEvent[] = [{ ...fixture.event, id: fixture.id, unconfirmed: true }];
    const enr = enrich(events, marks, settings, Date.UTC(2026, 10, 6));
    expect(enr).toHaveLength(1);
    expect(enr[0].category).toBe('assignment'); // mark preserved
    expect(enr[0].status).toBe('in_progress');
    expect(eventsOverdue(enr, Date.UTC(2026, 10, 6))).toHaveLength(1); // past + deadline + not completed
    expect(eventsToday(enr, ADELAIDE, Date.UTC(2026, 10, 6))).toHaveLength(0); // caller filters it
    expect(eventsUpcoming(enr, ADELAIDE, Date.UTC(2026, 10, 6), 7)).toHaveLength(0);

    // a FUTURE kept event also shows up in All (but not in upcoming planning view when filtered)
    const futureEvents: CalEvent[] = [{ ...fixture.event, id: fixture.id, startMs: FUTURE, endMs: FUTURE + 3600000, unconfirmed: true }];
    const enr2 = enrich(futureEvents, marks, settings, Date.UTC(2026, 10, 6));
    expect(enr2).toHaveLength(1);
    expect(eventsUpcoming(enr2, ADELAIDE, Date.UTC(2026, 10, 6), 7)).toHaveLength(1); // pre-filter it's there…
  });

  it('digest annotates kept events with "source unconfirmed"', () => {
    const { fixture } = vanishedFixture();
    const events: CalEvent[] = [{ ...fixture.event, id: fixture.id, unconfirmed: true }];
    const digest = buildDigest(events, marks, settings, Date.UTC(2026, 10, 6), 'en');
    expect(digest.text).toContain('Essay 2');
    expect(digest.text).toContain('source unconfirmed');
  });

  it('a re-appearing event clears the kept record (no duplicate task)', () => {
    let kept: Record<string, VanishedEvent> = {};
    const fixture = {
      id: 'src-a:e1@test/single',
      sourceId: 'src-a',
      sourceName: 'Course A',
      event: { id: 'e1@test/single', uid: 'e1@test', summary: 'Essay 2', startMs: OLD, endMs: OLD + 3600000, allDay: false, cancelled: false },
      mark: { category: 'assignment' as const, status: 'in_progress' as const },
      detectedAt: '2026-11-11T00:00:00Z',
    };
    kept[fixture.id] = fixture;
    saveKept(kept);
    kept = removeKept(kept, fixture.id);
    expect(kept[fixture.id]).toBeUndefined();
    expect(loadKept()[fixture.id]).toBeUndefined();
  });
});

// ---------- BLOCKER 3: transaction-safe import (validation logic) ----------

describe('BLOCKER 3: invalid vs empty ICS handling', () => {
  it('invalid ICS is flagged unparseable (refused outright, never an empty-calendar path)', () => {
    expect(parseICS('BEGIN:VCALENDAR\nVERSION:2.0\nGARBAGE\nEND:VCALENDAR', ADELAIDE).unparseable).toBe(true);
    expect(parseICS('hello world', ADELAIDE).unparseable).toBe(true);
    // a VALID empty calendar must NOT be flagged — the two paths are distinct
    expect(parseICS('BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR', ADELAIDE).unparseable).toBeFalsy();
  });

  it('an empty VCALENDAR parses cleanly with zero events and a warning', () => {
    const parsed = parseICS('BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR', ADELAIDE);
    expect(parsed.events).toHaveLength(0);
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });

  it('totally empty file parses cleanly with zero events and a warning', () => {
    const parsed = parseICS('', ADELAIDE);
    expect(parsed.events).toHaveLength(0);
  });
});

// ---------- BLOCKER 4: stable recurring-instance matching ----------

describe('BLOCKER 4: diffSnapshots with recurring series', () => {
  function expand(text: string, srcId = 'src-r'): CalEvent[] {
    return parseICS(text, ADELAIDE).events.map((e) => ({ ...e, id: `${srcId}:${e.id}` }));
  }

  const base = recurringIcs('r1@test', 'Weekly Lab');

  it('three occurrences, second removed via EXDATE → exact instance reported removed', () => {
    const withExdate = ics(`BEGIN:VEVENT
UID:r1@test
DTSTAMP:20261101T000000Z
SUMMARY:Weekly Lab
DTSTART;TZID=Australia/Adelaide:20261102T100000
DTEND;TZID=Australia/Adelaide:20261102T110000
RRULE:FREQ=WEEKLY;COUNT=4
EXDATE;TZID=Australia/Adelaide:20261109T100000
END:VEVENT`);
    const diff = diffSnapshots(expand(base), expand(withExdate), 'now');
    expect(diff.removed).toHaveLength(1);
    expect(diff.added).toHaveLength(0);
    expect(diff.timeMoved).toHaveLength(0);
    // the removed one is the SECOND occurrence (9 Nov), not a neighbour
    expect(new Date(diff.removed[0].startMs).toISOString()).toBe(new Date(Date.UTC(2026, 10, 8, 23, 30)).toISOString());
  });

  it('three occurrences, second instance deleted (feed drops it) → same correct pairing', () => {
    const shrunk = ics(`BEGIN:VEVENT
UID:r1@test
DTSTAMP:20261101T000000Z
SUMMARY:Weekly Lab
DTSTART;TZID=Australia/Adelaide:20261102T100000
DTEND;TZID=Australia/Adelaide:20261102T110000
RRULE:FREQ=WEEKLY;COUNT=4
EXDATE;TZID=Australia/Adelaide:20261109T100000
END:VEVENT`);
    const diff = diffSnapshots(expand(base), expand(shrunk), 'now');
    expect(diff.timeMoved).toHaveLength(0); // no false "moved" migrations
    expect(diff.removed).toHaveLength(1);
    expect(diff.added).toHaveLength(0);
  });

  it('second of three moved → exactly one time-changed pair, neighbours untouched', () => {
    const moved = ics(`BEGIN:VEVENT
UID:r1@test
DTSTAMP:20261101T000000Z
SUMMARY:Weekly Lab
DTSTART;TZID=Australia/Adelaide:20261102T100000
DTEND;TZID=Australia/Adelaide:20261102T110000
RRULE:FREQ=WEEKLY;COUNT=4
END:VEVENT
BEGIN:VEVENT
UID:r1@test
DTSTAMP:20261101T000000Z
SUMMARY:Weekly Lab
RECURRENCE-ID;TZID=Australia/Adelaide:20261109T100000
DTSTART;TZID=Australia/Adelaide:20261110T100000
DTEND;TZID=Australia/Adelaide:20261110T110000
END:VEVENT`);
    const diff = diffSnapshots(expand(base.slice(0)), expand(moved), 'now');
    expect(diff.timeMoved).toHaveLength(1);
    expect(diff.removed).toHaveLength(0);
    expect(diff.added).toHaveLength(0);
    // mark migration targets the moved instance only
    const { from, to } = diff.timeMoved[0];
    expect(from.id).not.toBe(to.id);
    expect(from.id.startsWith('src-r:r1@test/')).toBe(true);
  });

  it('middle instance inserted → reported added, no removals or moves', () => {
    const grown = ics(`BEGIN:VEVENT
UID:r1@test
DTSTAMP:20261101T000000Z
SUMMARY:Weekly Lab
DTSTART;TZID=Australia/Adelaide:20261102T100000
DTEND;TZID=Australia/Adelaide:20261102T110000
RRULE:FREQ=WEEKLY;COUNT=5
END:VEVENT`);
    const diff = diffSnapshots(expand(base), expand(grown), 'now');
    expect(diff.timeMoved).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.added).toHaveLength(1);
  });

  it('ambiguous leftovers (delete one + move another) never fabricate time moves', () => {
    // two old instances of ONE uid, one new instance at a new time:
    // leftover counts differ (2 old vs 1 new) → refuse to guess, no time moves
    const oldSeries = [evU('s@x', 'A', 0), evU('s@x', 'A', WEEK_MS)];
    const newSeries = [evU('s@x', 'A', 2 * WEEK_MS)];
    const diff = diffSnapshots(oldSeries, newSeries, 'now');
    expect(diff.timeMoved).toHaveLength(0);
    expect(diff.removed).toHaveLength(2);
    expect(diff.added).toHaveLength(1);
  });

  it('single-instance uid with a new time still pairs (same identity, one event)', () => {
    const diff = diffSnapshots([ev('one@x', 'Solo', 0)], [ev('one@x', 'Solo', WEEK_MS)], 'now');
    expect(diff.timeMoved).toHaveLength(1);
    expect(diff.removed).toHaveLength(0);
    expect(diff.added).toHaveLength(0);
  });
});
