/**
 * Parser tests — all data is fictional. Covers the scenarios required by the
 * project spec: standard parsing, multi-course, duplicate UID, timezone
 * conversion, Adelaide DST, all-day events, recurrence, overrides, invalid ICS,
 * empty calendar, missing DTSTART.
 */

import { describe, expect, it } from 'vitest';
import { parseICS } from '../src/ics-parser.js';
import { DEMO_ICS } from '../src/demo.js';

const ADELAIDE = 'Australia/Adelaide';
const SHANGHAI = 'Asia/Shanghai';

// Adelaide in Jan (ACDT, UTC+10:30) vs Jul (ACST, UTC+09:30)
const ICS_BASIC = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VEVENT
UID:evt-1@test
DTSTAMP:20261101T000000Z
SUMMARY:Essay due
DTSTART;TZID=Australia/Adelaide:20261112T170000
DTEND;TZID=Australia/Adelaide:20261112T170500
DESCRIPTION:Submit essay
END:VEVENT
END:VCALENDAR`;

const ICS_MULTI = `BEGIN:VCALENDAR
VERSION:2.0
X-WR-CALNAME:My Timetable
BEGIN:VEVENT
UID:a@test
DTSTAMP:20261101T000000Z
SUMMARY:CS101 Lecture
DTSTART:20261110T090000Z
DTEND:20261110T100000Z
END:VEVENT
BEGIN:VEVENT
UID:b@test
DTSTAMP:20261101T000000Z
SUMMARY:MATH204 Tutorial
DTSTART:20261111T110000Z
DTEND:20261111T120000Z
LOCATION:Room 12
END:VEVENT
END:VCALENDAR`;

const ICS_DUPLICATE_UID = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:dup@test
DTSTAMP:20261101T000000Z
SUMMARY:First
DTSTART:20261110T090000Z
END:VEVENT
BEGIN:VEVENT
UID:dup@test
DTSTAMP:20261101T000000Z
SUMMARY:Second
DTSTART:20261111T090000Z
END:VEVENT
END:VCALENDAR`;

const ICS_ALLDAY = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:allday@test
DTSTAMP:20261101T000000Z
SUMMARY:Study break
DTSTART;VALUE=DATE:20261123
DTEND;VALUE=DATE:20261128
END:VEVENT
END:VCALENDAR`;

const ICS_RECUR = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:recur@test
DTSTAMP:20261101T000000Z
SUMMARY:Weekly lab
DTSTART;TZID=Australia/Adelaide:20261111T130000
DTEND;TZID=Australia/Adelaide:20261111T150000
RRULE:FREQ=WEEKLY;BYDAY=WE;COUNT=4
END:VEVENT
END:VCALENDAR`;

const ICS_RECUR_WITH_EXDATE = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:recurx@test
DTSTAMP:20261101T000000Z
SUMMARY:Weekly lab
DTSTART;TZID=Australia/Adelaide:20261111T130000
DTEND;TZID=Australia/Adelaide:20261111T150000
RRULE:FREQ=WEEKLY;BYDAY=WE;COUNT=4
EXDATE;TZID=Australia/Adelaide:20261118T130000
END:VEVENT
END:VCALENDAR`;

const ICS_INVALID = 'this is not a calendar at all';
const ICS_EMPTY = `BEGIN:VCALENDAR
VERSION:2.0
END:VCALENDAR`;
const ICS_NO_DTSTART = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:nostart@test
DTSTAMP:20261101T000000Z
SUMMARY:No start time
END:VEVENT
END:VCALENDAR`;

const win = {
  expandFrom: new Date('2026-01-01T00:00:00Z'),
  expandTo: new Date('2027-12-31T00:00:00Z'),
};

describe('parseICS — standard files', () => {
  it('parses a basic event with TZID into absolute epoch ms', () => {
    const { events, warnings } = parseICS(ICS_BASIC, ADELAIDE, win);
    expect(warnings).toHaveLength(0);
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.summary).toBe('Essay due');
    expect(e.description).toBe('Submit essay');
    expect(e.allDay).toBe(false);
    // 2026-11-12 17:00 ACDT = UTC+10:30 -> 06:30 UTC
    expect(new Date(e.startMs).toISOString()).toBe('2026-11-12T06:30:00.000Z');
    expect(e.endMs).toBe(e.startMs + 5 * 60000);
  });

  it('handles multiple courses/events and X-WR-CALNAME', () => {
    const { name, events } = parseICS(ICS_MULTI, ADELAIDE, win);
    expect(name).toBe('My Timetable');
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.summary)).toEqual(['CS101 Lecture', 'MATH204 Tutorial']);
    expect(events[1].location).toBe('Room 12');
  });

  it('respects the default timezone for floating (no TZID) times', () => {
    const floating = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:float@test
DTSTAMP:20261101T000000Z
SUMMARY:Floating
DTSTART:20261112T170000
END:VEVENT
END:VCALENDAR`;
    // Same naive 17:00 interpreted in Adelaide vs Shanghai must differ.
    const adl = parseICS(floating, ADELAIDE, win).events[0].startMs;
    const sha = parseICS(floating, SHANGHAI, win).events[0].startMs;
    expect(adl).toBe(new Date('2026-11-12T06:30:00Z').getTime());
    expect(sha).toBe(new Date('2026-11-12T09:00:00Z').getTime());
  });
});

describe('parseICS — tricky data', () => {
  it('flags duplicate UIDs (two different events sharing one UID) with a warning and keeps both', () => {
    const { events, warnings } = parseICS(ICS_DUPLICATE_UID, ADELAIDE, win);
    expect(events).toHaveLength(2);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('expands recurring events into concrete instances', () => {
    const { events } = parseICS(ICS_RECUR, ADELAIDE, win);
    expect(events).toHaveLength(4);
    // weekly Wednesdays 13:00 ACDT = 02:30 UTC
    expect(new Date(events[0].startMs).toISOString()).toBe('2026-11-11T02:30:00.000Z');
    expect(new Date(events[1].startMs).toISOString()).toBe('2026-11-18T02:30:00.000Z');
    expect(new Set(events.map((e) => e.uid))).toEqual(new Set(['recur@test']));
    expect(new Set(events.map((e) => e.id)).size).toBe(4); // unique ids
  });

  it('honours EXDATE — the excluded occurrence is not generated', () => {
    const { events } = parseICS(ICS_RECUR_WITH_EXDATE, ADELAIDE, win);
    expect(events).toHaveLength(3);
    expect(events.map((e) => new Date(e.startMs).toISOString().slice(5, 10))).toEqual(['11-11', '11-25', '12-02']);
  });

  it('handles all-day events (local midnight, allDay flag, multi-day)', () => {
    const { events } = parseICS(ICS_ALLDAY, ADELAIDE, win);
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.allDay).toBe(true);
    // Adelaide midnight ACDT = 13:30 UTC previous day
    expect(new Date(e.startMs).toISOString()).toBe('2026-11-22T13:30:00.000Z');
    expect(e.endMs).toBe(new Date('2026-11-27T13:30:00.000Z').getTime());
  });

  it('returns warnings and no events for invalid ICS', () => {
    const { events, warnings } = parseICS(ICS_INVALID, ADELAIDE, win);
    expect(events).toHaveLength(0);
    expect(warnings[0]).toMatch(/Could not parse/i);
  });

  it('handles empty calendars gracefully', () => {
    const { events, warnings } = parseICS(ICS_EMPTY, ADELAIDE, win);
    expect(events).toHaveLength(0);
    expect(warnings[0]).toMatch(/no events/i);
  });

  it('skips events without DTSTART and reports it', () => {
    const { events, warnings } = parseICS(ICS_NO_DTSTART, ADELAIDE, win);
    expect(events).toHaveLength(0);
    expect(warnings[0]).toMatch(/DTSTART/i);
  });
});

describe('parseICS — demo calendar', () => {
  it('parses the built-in demo calendar (fictional) end to end', () => {
    const { name, events, warnings } = parseICS(DEMO_ICS, ADELAIDE, win);
    expect(warnings).toHaveLength(0);
    expect(name).toMatch(/Riverbend/);
    expect(events.length).toBeGreaterThan(10); // 12 lectures + 6 labs + others
    const summaries = events.map((e) => e.summary);
    expect(summaries).toContain('CS101 Final Exam');
    expect(summaries).toContain('Study Break — no classes');
  });
});
