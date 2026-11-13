/**
 * UniFlow Core — shared types.
 * Everything here is plain data: serializable to localStorage, no DOM dependencies.
 */

/** Categories a student can assign to an event. "other" is the safe default — we never guess. */
export type EventCategory = 'assignment' | 'quiz' | 'exam' | 'class' | 'other';

/** Manual task status the student controls. The app never claims LMS submission state. */
export type TaskStatus = 'not_started' | 'in_progress' | 'completed';

/** Deterministic priority buckets produced by the rule engine. */
export type Priority = 'overdue' | 'urgent' | 'high' | 'upcoming' | 'later';

/**
 * A single calendar event instance (recurring events are expanded into instances).
 * `startMs`/`endMs` are epoch milliseconds (UTC-based), always absolute moments in time.
 * For all-day events, times represent local midnight of the calendar's day, marked allDay.
 */
export interface CalEvent {
  /** Instance key: uid + '/' + recurrence instance id (or just uid for single events). */
  id: string;
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  startMs: number;
  endMs: number;
  allDay: boolean;
  /** IANA tz id if the source declared one (informational). */
  tzid?: string;
  /** True when the source calendar marked the event cancelled via STATUS:CANCELLED. */
  cancelled: boolean;
  /**
   * True when the student chose "Keep visible" for an event that has vanished
   * from its source feed. The task keeps rendering (All / Overdue / digest)
   * with an explicit "source unconfirmed" flag until the source re-adds it
   * or the student resolves it. Never fabricated by the app itself.
   */
  unconfirmed?: boolean;
}

/** Result of parsing one ICS source. */
export interface ParsedCalendar {
  /** Display name from X-WR-CALNAME, if present. */
  name?: string;
  events: CalEvent[];
  /** Human-readable warnings about anything we could not cleanly parse. */
  warnings: string[];
  /**
   * True when the file could not be interpreted as an iCalendar document at
   * all (corrupt, not a VCALENDAR). Callers must refuse such files outright —
   * distinct from a VALID calendar that simply contains zero events.
   */
  unparseable?: boolean;
}

export interface CalendarSource {
  id: string;
  name: string;
  /** 'file' = uploaded/imported text; 'url' = subscribed (fetched); 'demo' = built-in sample. */
  sourceType: 'file' | 'url' | 'demo';
  /** Raw ICS text for file/demo sources; for url sources we keep last successful fetch. */
  icsText: string;
  /** ISO timestamp of last successful import/sync; undefined if never succeeded. */
  lastSyncedAt?: string;
  /** URL sources only: true when last sync attempt failed — data is shown but marked stale. */
  stale?: boolean;
  /** URL sources only: last sync error message (never includes the full URL). */
  lastError?: string;
}

/** What changed between the previous and current state of one source. */
export interface SourceChange {
  kind: 'added' | 'removed' | 'time-changed' | 'title-changed';
  uid: string;
  summary: string;
  detail?: string;
  /** ISO timestamp when this change was first detected. */
  detectedAt: string;
}

/**
 * An event that disappeared from its source calendar on re-import.
 * The full snapshot (and the student's marks) are preserved and shown as
 * "vanished from source — needs your confirmation". Disappearing from a feed
 * is NOT treated as the school cancelling the assignment, and never silently
 * deletes the student's data.
 */
export interface VanishedEvent {
  /** Source-scoped event id (see storage.eventId). */
  id: string;
  sourceId: string;
  sourceName: string;
  event: CalEvent;
  /** The student's marks at the moment of disappearance. */
  mark: EventMark;
  detectedAt: string;
  /** How the student resolved it: 'archived' = hidden as resolved, 'cancelled' = marked cancelled. */
  resolution?: 'archived' | 'cancelled' | 'restored';
  /** When the student clicked "Keep visible" (kept store entries only). */
  restoredAt?: string;
  /** When the student ended the kept-visible state (archived / marked cancelled). */
  resolvedAt?: string;
}

export interface Settings {
  /** IANA timezone the student lives in, e.g. "Australia/Adelaide". */
  timezone: string;
  language: 'en' | 'zh-CN';
  /** Hour of day (0-23, local) for the daily digest. */
  digestHour: number;
  /** Priority thresholds in hours before the deadline. */
  urgentHours: number;
  highHours: number;
  soonDays: number;
}

/** Per-event user marks, stored separately from the parsed event data. */
export interface EventMark {
  category: EventCategory;
  status: TaskStatus;
}

/** Categories that represent deadlines (the rule engine only applies to these). */
export const DEADLINE_CATEGORIES: ReadonlySet<EventCategory> = new Set(['assignment', 'quiz', 'exam']);

export const DEFAULT_SETTINGS: Settings = {
  timezone: 'Australia/Adelaide',
  language: 'en',
  digestHour: 8,
  urgentHours: 24,
  highHours: 72,
  soonDays: 7,
};
