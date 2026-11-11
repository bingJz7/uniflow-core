/**
 * UniFlow Core — sync diff engine.
 *
 * Compares a previously imported snapshot of a source against a fresh one and
 * reports what changed. Philosophy (mirrors the project principles):
 *
 *  - An event DISAPPEARING from a feed is NOT treated as the school cancelling
 *    the assignment. It is reported as "removed from feed" and the event is
 *    kept visible but flagged, never silently deleted.
 *  - Only verified content changes (time / title) are surfaced as changes.
 *  - Events are matched by UID first (occurrences of one UID are paired in
 *    chronological order), so a moved deadline shows up as a time change,
 *    not as a confusing remove+add pair.
 */

import type { CalEvent, SourceChange } from './types.js';

export interface DiffResult {
  changes: SourceChange[];
  /** Events in new snapshot that were not in the old one. */
  added: CalEvent[];
  /** Events in the old snapshot that vanished from the feed (kept, flagged). */
  removed: CalEvent[];
}

interface InstancePair {
  prev?: CalEvent;
  next?: CalEvent;
}

/** Group events by uid and sort each group chronologically. */
function groupByUid(events: CalEvent[]): Map<string, CalEvent[]> {
  const map = new Map<string, CalEvent[]>();
  for (const e of events) {
    const list = map.get(e.uid) ?? [];
    list.push(e);
    map.set(e.uid, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.startMs - b.startMs);
  return map;
}

export function diffSnapshots(oldEvents: CalEvent[], newEvents: CalEvent[], nowIso: string): DiffResult {
  const oldByUid = groupByUid(oldEvents);
  const newByUid = groupByUid(newEvents);
  const changes: SourceChange[] = [];
  const added: CalEvent[] = [];
  const removed: CalEvent[] = [];

  const uids = new Set([...oldByUid.keys(), ...newByUid.keys()]);
  for (const uid of uids) {
    const olds = oldByUid.get(uid) ?? [];
    const news = newByUid.get(uid) ?? [];

    // Pair occurrences in chronological order: i-th old with i-th new.
    const pairs: InstancePair[] = [];
    for (let i = 0; i < Math.max(olds.length, news.length); i++) {
      pairs.push({ prev: olds[i], next: news[i] });
    }

    for (const { prev, next } of pairs) {
      if (prev && !next) {
        removed.push(prev);
        changes.push({
          kind: 'removed',
          uid,
          summary: prev.summary,
          detail: 'disappeared from the calendar feed — kept here and flagged, not deleted',
          detectedAt: nowIso,
        });
      } else if (!prev && next) {
        added.push(next);
        changes.push({
          kind: 'added',
          uid,
          summary: next.summary,
          detail: next.allDay ? 'all-day' : undefined,
          detectedAt: nowIso,
        });
      } else if (prev && next) {
        if (prev.startMs !== next.startMs || prev.endMs !== next.endMs) {
          changes.push({
            kind: 'time-changed',
            uid,
            summary: next.summary,
            detail: `was ${new Date(prev.startMs).toISOString()} → now ${new Date(next.startMs).toISOString()}`,
            detectedAt: nowIso,
          });
        } else if (prev.summary !== next.summary) {
          changes.push({
            kind: 'title-changed',
            uid,
            summary: next.summary,
            detail: `was "${prev.summary}"`,
            detectedAt: nowIso,
          });
        }
      }
    }
  }

  return { changes, added, removed };
}
