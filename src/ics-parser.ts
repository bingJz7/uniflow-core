/**
 * UniFlow Core — ICS parsing (RFC 5545) built on ical.js (Mozilla).
 *
 * We deliberately do NOT hand-roll an iCalendar parser. ical.js handles
 * DTSTART/DTEND/DURATION, RRULE, EXDATE, RECURRENCE-ID, VTIMEZONE and
 * multi-line folding for us. This module adapts its output to UniFlow's
 * plain `CalEvent` model:
 *
 *  - Recurring events are EXPANDED into concrete instances inside a window
 *    (default: 1 year back .. 2 years forward from parse time), capped so a
 *    pathological RRULE cannot hang the app.
 *  - RECURRENCE-ID overrides replace the corresponding expanded instance.
 *  - Floating times (no TZID, no "Z") are interpreted in `defaultTz` — the
 *    timezone the user selected in Settings.
 *  - All-day events have no time-of-day; they get local midnight of the
 *    user's timezone. We never invent a deadline time.
 *  - Anything unparseable produces a warning, not a crash. We never
 *    fabricate events we could not actually read.
 */

import ICAL from 'ical.js';
import { wallClockToMs } from './timezone.js';
import type { CalEvent, ParsedCalendar } from './types.js';

export interface ParseOptions {
  /** Window start for RRULE expansion (default: parse time minus 1 year). */
  expandFrom?: Date;
  /** Window end for RRULE expansion (default: parse time plus 2 years). */
  expandTo?: Date;
  /** Safety cap on expanded instances per recurring event (default 400). */
  maxInstances?: number;
}

const DEFAULT_MAX_INSTANCES = 400;

interface RawVevent {
  uid: string;
  recurrenceIdMs?: number; // undefined = master occurrence
  start?: ICAL.Time;
  end?: ICAL.Time;
  durationSeconds?: number;
  summary?: string;
  description?: string;
  location?: string;
  tzid?: string;
  cancelled: boolean;
  /** The source VEVENT component (needed for RRULE detection / expansion). */
  comp: ICAL.Component;
}

function unescapeText(v?: string): string | undefined {
  if (v === undefined || v === null) return undefined;
  return v
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/** True when an ICAL.Time is "floating": a naive wall-clock time with no zone. */
function isFloating(t: ICAL.Time): boolean {
  return !t.isDate && (t.zone === null || t.zone === undefined || t.zone.tzid === 'floating');
}

/**
 * Convert an ICAL.Time to epoch ms.
 * - Date values (all-day): local midnight in `defaultTz`.
 * - Floating naive times: interpreted as wall clock in `defaultTz`.
 * - Zoned times (UTC or VTIMEZONE): use ical.js resolution.
 */
function timeToMs(t: ICAL.Time, defaultTz: string): number {
  // NOTE: ical.js ICAL.Time month is 1-based (January = 1), same as our helper.
  if (t.isDate) {
    return wallClockToMs(defaultTz, t.year, t.month, t.day, 0, 0);
  }
  if (isFloating(t)) {
    return wallClockToMs(defaultTz, t.year, t.month, t.day, t.hour, t.minute);
  }
  return t.toUnixTime() * 1000;
}

function extractVevent(comp: ICAL.Component, defaultTz: string): RawVevent | null {
  const uidProp = comp.getFirstPropertyValue('uid');
  const start = comp.getFirstPropertyValue('dtstart') as ICAL.Time | null;
  // A VEVENT without DTSTART is invalid per RFC 5545 — skip with a warning upstream.
  if (!start) return null;

  const end = comp.getFirstPropertyValue('dtend') as ICAL.Time | null;
  const durationProp = comp.getFirstProperty('duration');
  const durationSeconds = durationProp ? (comp.getFirstPropertyValue('duration') as unknown as ICAL.Duration).toSeconds() : undefined;
  const status = (comp.getFirstPropertyValue('status') as string | null)?.toUpperCase();

  // RECURRENCE-ID (Phase 2 fix): per RFC 5545 the RECURRENCE-ID value must be
  // interpreted in the same timezone context as the DTSTART it overrides.
  // Some exporters omit the TZID on RECURRENCE-ID even though DTSTART has one,
  // and a bare UTC interpretation previously misaligned the override with its
  // occurrence. Resolution order: RECURRENCE-ID's own TZID > DTSTART's TZID >
  // user-selected timezone (for floating values).
  const recIdProp = comp.getFirstProperty('recurrence-id');
  const recurrenceId = recIdProp?.getFirstValue() as ICAL.Time | undefined;
  let recurrenceIdMs: number | undefined;
  if (recurrenceId) {
    const recTzid = recIdProp?.getParameter('tzid') as string | undefined;
    const dtTzid = comp.getFirstProperty('dtstart')?.getParameter('tzid') as string | undefined;
    const tzid = recTzid ?? dtTzid;
    if (isFloating(recurrenceId) && tzid) {
      const zone = safeGetTimezone(tzid);
      if (zone) {
        const zoned = recurrenceId.clone();
        zoned.zone = zone;
        recurrenceIdMs = zoned.toUnixTime() * 1000;
      } else {
        recurrenceIdMs = timeToMs(recurrenceId, defaultTz);
      }
    } else {
      recurrenceIdMs = timeToMs(recurrenceId, defaultTz);
    }
  }

  return {
    uid: String(uidProp ?? ''),
    recurrenceIdMs,
    start,
    end: end ?? undefined,
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : undefined,
    summary: unescapeText(comp.getFirstPropertyValue('summary') as string | undefined),
    description: unescapeText(comp.getFirstPropertyValue('description') as string | undefined),
    location: unescapeText(comp.getFirstPropertyValue('location') as string | undefined),
    tzid: (comp.getFirstProperty('dtstart')?.getParameter('tzid') as string | undefined) ?? undefined,
    cancelled: status === 'CANCELLED',
    comp,
  };
}

/** Resolve a TZID through the (VTIMEZONE-populated) service; never throws. */
function safeGetTimezone(tzid: string): InstanceType<typeof ICAL.Timezone> | null {
  try {
    return ICAL.TimezoneService.get(tzid) ?? null;
  } catch {
    return null;
  }
}

function buildInstance(raw: RawVevent, startMs: number, endMs: number, instanceKey: string): CalEvent {
  return {
    id: `${raw.uid}/${instanceKey}`,
    uid: raw.uid,
    summary: raw.summary?.trim() || '(no title)',
    description: raw.description,
    location: raw.location,
    startMs,
    endMs,
    allDay: raw.start!.isDate,
    tzid: raw.tzid,
    cancelled: raw.cancelled,
  };
}

/** End time: DTEND, else DURATION, else sensible default (30 min / 1 day). */
function resolveEndMs(raw: RawVevent, startMs: number, defaultTz: string): number {
  if (raw.end) return timeToMs(raw.end, defaultTz);
  if (raw.durationSeconds !== undefined) return startMs + raw.durationSeconds * 1000;
  return raw.start!.isDate ? startMs + 86400000 : startMs + 30 * 60000;
}

export function parseICS(icsText: string, defaultTz: string, opts: ParseOptions = {}): ParsedCalendar {
  const warnings: string[] = [];
  const events: CalEvent[] = [];
  const now = new Date();
  const expandFrom = (opts.expandFrom ?? new Date(now.getTime() - 365 * 86400000)).getTime();
  const expandTo = (opts.expandTo ?? new Date(now.getTime() + 730 * 86400000)).getTime();
  const maxInstances = opts.maxInstances ?? DEFAULT_MAX_INSTANCES;

  let root: InstanceType<typeof ICAL.Component>;
  try {
    root = new ICAL.Component(ICAL.parse(icsText));
  } catch (err) {
    return {
      events: [],
      warnings: [
        `Could not parse this file as an iCalendar (.ics) document: ${(err as Error).message}`,
      ],
    };
  }
  if (root.name !== 'vcalendar') {
    return { events: [], warnings: ['This file does not contain a VCALENDAR component.'] };
  }

  // Register embedded VTIMEZONEs so named TZIDs resolve correctly.
  const registeredTz = new Set<string>();
  for (const vt of root.getAllSubcomponents('vtimezone')) {
    try {
      const tz = new ICAL.Timezone(vt);
      if (tz.tzid && !registeredTz.has(tz.tzid)) {
        ICAL.TimezoneService.register(tz);
        registeredTz.add(tz.tzid);
      }
    } catch {
      warnings.push('Some embedded timezone definitions (VTIMEZONE) could not be read; times may be shown in UTC.');
    }
  }

  const calName = root.getFirstPropertyValue('x-wr-calname');
  const name = typeof calName === 'string' && calName.trim() ? calName.trim() : undefined;

  const vevents = root.getAllSubcomponents('vevent');
  if (vevents.length === 0) {
    return { name, events: [], warnings: ['This calendar contains no events (empty calendar).'] };
  }

  // Group by UID to apply RECURRENCE-ID overrides.
  const byUid = new Map<string, RawVevent[]>();
  for (const vevent of vevents) {
    let raw: RawVevent | null;
    try {
      raw = extractVevent(vevent, defaultTz);
    } catch (err) {
      warnings.push(`Skipped one event that could not be read: ${(err as Error).message}`);
      continue;
    }
    if (!raw) {
      warnings.push('Skipped one event without a DTSTART (no start time declared).');
      continue;
    }
    if (!raw.uid) {
      warnings.push(`Skipped an event titled "${raw.summary ?? '(no title)'}" because it has no UID.`);
      continue;
    }
    const list = byUid.get(raw.uid) ?? [];
    list.push(raw);
    byUid.set(raw.uid, list);
  }

  for (const [uid, raws] of byUid) {
    try {
      const masters = raws.filter((r) => r.recurrenceIdMs === undefined);
      const overrides = new Map<number, RawVevent>();
      for (const r of raws) if (r.recurrenceIdMs !== undefined) overrides.set(r.recurrenceIdMs, r);

      if (masters.length === 0) {
        // Recurrence-override with no master: treat each as a standalone event.
        for (const r of raws) {
          const startMs = timeToMs(r.start!, defaultTz);
          events.push(buildInstance(r, startMs, resolveEndMs(r, startMs, defaultTz), 'override'));
        }
        continue;
      }

      if (masters.length > 1) {
        // Duplicate UID carrying several distinct events — a sloppy exporter.
        // We keep every event (never lose student data) and warn loudly.
        warnings.push(`UID "${uid}" is used by ${masters.length} different events in this file; all are kept, but the source calendar should be fixed.`);
      }

      const master = masters.find((m) => hasRruleComponent(m)) ?? masters[0];
      const nonMasterMasters = masters.filter((m) => m !== master);

      const hasRRule = hasRruleComponent(master);

      const emit = (raw: RawVevent, startMs: number, key: string) => {
        let endMs = resolveEndMs(raw, startMs, defaultTz);
        if (endMs < startMs) {
          warnings.push(`Event "${raw.summary ?? uid}" has an end time before its start time; end adjusted to start.`);
          endMs = startMs;
        }
        events.push(buildInstance(raw, startMs, endMs, key));
      };

      if (!hasRRule) {
        emit(master, timeToMs(master.start!, defaultTz), 'single');
        for (const extra of nonMasterMasters) {
          emit(extra, timeToMs(extra.start!, defaultTz), `dup-${events.length}`);
        }
        // Overrides for non-recurring events (date was moved once).
        for (const [recMs, o] of overrides) {
          emit(o, timeToMs(o.start!, defaultTz), `override-${recMs}`);
        }
        continue;
      }

      // Recurring: expand with ical.js iterator (handles RRULE + EXDATE).
      // IMPORTANT: for recurring events DTEND/DURATION is a per-occurrence
      // duration, not an absolute time — compute the duration once from the
      // master and apply it to every expanded start.
      const masterStartMs = timeToMs(master.start!, defaultTz);
      const masterEndMs = resolveEndMs(master, masterStartMs, defaultTz);
      const occurrenceDurationMs = Math.max(0, masterEndMs - masterStartMs);

      const event = new ICAL.Event(master.comp);
      const iterator = event.iterator(); // starts at DTSTART; no seed duplication
      let count = 0;
      let scanned = 0;
      let occurrence: ICAL.Time | null | undefined = iterator.next();
      // RecurExpansion.next() returns null when the recurrence is exhausted.
      while (occurrence !== null && occurrence !== undefined) {
        // Use the SAME conversion path as RECURRENCE-ID keys (timeToMs) so
        // floating occurrences (feeds without VTIMEZONE) match their overrides.
        const occMs = timeToMs(occurrence, defaultTz);
        if (occMs > expandTo) break;
        if (occMs >= expandFrom) {
          const override = overrides.get(occMs);
          if (override) {
            emit(override, timeToMs(override.start!, defaultTz), `override-${occMs}`);
          } else {
            const startMs = timeToMs(occurrence, defaultTz);
            events.push(buildInstance(master, startMs, startMs + occurrenceDurationMs, String(occMs)));
          }
          count++;
          if (count >= maxInstances) {
            warnings.push(`Recurring event "${master.summary ?? uid}" was capped at ${maxInstances} occurrences.`);
            break;
          }
        }
        scanned++;
        if (scanned >= 20000) {
          warnings.push(`Recurring event "${master.summary ?? uid}" produced too many occurrences to scan; showing the first ${count}.`);
          break;
        }
        occurrence = iterator.next();
      }
    } catch (err) {
      warnings.push(`Could not process event "${uid}": ${(err as Error).message}`);
    }
  }

  // Duplicate exact instances (same uid + same start) can happen with
  // sloppy exporters — deduplicate, but tell the user.
  const seen = new Map<string, CalEvent>();
  let deduped = 0;
  for (const ev of events) {
    const key = `${ev.uid}|${ev.startMs}|${ev.summary}`;
    if (seen.has(key)) {
      deduped++;
      continue;
    }
    seen.set(key, ev);
  }
  if (deduped > 0) {
    warnings.push(`Removed ${deduped} duplicate event entr${deduped === 1 ? 'y' : 'ies'} exported more than once by the source calendar.`);
  }

  events.sort((a, b) => a.startMs - b.startMs);
  return { name, events, warnings };
}

/** Check whether the master component carries an RRULE. */
function hasRruleComponent(master: RawVevent): boolean {
  try {
    return !!master.comp.getFirstProperty('rrule');
  } catch {
    return false;
  }
}
