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
 *  - Occurrences of one UID are paired with a LONGEST COMMON SUBSEQUENCE over
 *    their start times (BLOCKER 4 fix). This is stable when instances are
 *    inserted, deleted, or moved in the middle of a series: the 3rd occurrence
 *    stays the 3rd occurrence instead of being "moved" onto a neighbour's
 *    identity, so the student's per-instance marks never migrate wrongly.
 *  - When leftover counts differ on both sides, we refuse to guess: surplus
 *    old instances are reported as removed and surplus new ones as added.
 */

import type { CalEvent, SourceChange } from './types.js';

export interface DiffResult {
  changes: SourceChange[];
  /** Events in new snapshot that were not in the old one. */
  added: CalEvent[];
  /** Events in the old snapshot that vanished from the feed (kept, flagged). */
  removed: CalEvent[];
  /**
   * Matched pairs whose start time moved. Callers use these to migrate
   * per-instance marks (category/status) to the new instance key.
   */
  timeMoved: Array<{ from: CalEvent; to: CalEvent }>;
}

/**
 * Pair occurrences of ONE uid between the old and new snapshot.
 * Longest-common-subsequence on startMs keeps recurring instances aligned
 * by identity (their position in time), not by array index.
 */
function pairOccurrences(olds: CalEvent[], news: CalEvent[]): {
  matched: Array<{ prev: CalEvent; next: CalEvent }>;
  oldLeft: CalEvent[];
  newLeft: CalEvent[];
} {
  const n = olds.length;
  const m = news.length;
  // LCS DP table over exact startMs equality.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = olds[i].startMs === news[j].startMs
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const matched: Array<{ prev: CalEvent; next: CalEvent }> = [];
  const oldLeft: CalEvent[] = [];
  const newLeft: CalEvent[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (olds[i].startMs === news[j].startMs) {
      matched.push({ prev: olds[i], next: news[j] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      oldLeft.push(olds[i++]);
    } else {
      newLeft.push(news[j++]);
    }
  }
  while (i < n) oldLeft.push(olds[i++]);
  while (j < m) newLeft.push(news[j++]);
  return { matched, oldLeft, newLeft };
}

export function diffSnapshots(oldEvents: CalEvent[], newEvents: CalEvent[], nowIso: string): DiffResult {
  const oldByUid = new Map<string, CalEvent[]>();
  for (const e of oldEvents) {
    const list = oldByUid.get(e.uid) ?? [];
    list.push(e);
    oldByUid.set(e.uid, list);
  }
  const newByUid = new Map<string, CalEvent[]>();
  for (const e of newEvents) {
    const list = newByUid.get(e.uid) ?? [];
    list.push(e);
    newByUid.set(e.uid, list);
  }
  for (const list of oldByUid.values()) list.sort((a, b) => a.startMs - b.startMs);
  for (const list of newByUid.values()) list.sort((a, b) => a.startMs - b.startMs);

  const changes: SourceChange[] = [];
  const added: CalEvent[] = [];
  const removed: CalEvent[] = [];
  const timeMoved: Array<{ from: CalEvent; to: CalEvent }> = [];

  const uids = new Set([...oldByUid.keys(), ...newByUid.keys()]);
  for (const uid of uids) {
    const olds = oldByUid.get(uid) ?? [];
    const news = newByUid.get(uid) ?? [];
    const { matched, oldLeft, newLeft } = pairOccurrences(olds, news);

    // Exact-time matches: same occurrence identity. Report content drift only.
    for (const { prev, next } of matched) {
      if (prev.endMs !== next.endMs || prev.summary !== next.summary) {
        changes.push({
          kind: prev.summary !== next.summary ? 'title-changed' : 'time-changed',
          uid,
          summary: next.summary,
          detail: prev.summary !== next.summary ? `was "${prev.summary}"` : `duration changed (${new Date(prev.endMs).toISOString()} → ${new Date(next.endMs).toISOString()})`,
          detectedAt: nowIso,
        });
      }
    }

    // Leftovers: equal counts → pair chronologically (these are moved instances).
    if (oldLeft.length === newLeft.length) {
      // Both sorted by startMs already.
      for (let k = 0; k < oldLeft.length; k++) {
        const prev = oldLeft[k];
        const next = newLeft[k];
        timeMoved.push({ from: prev, to: next });
        changes.push({
          kind: 'time-changed',
          uid,
          summary: next.summary,
          detail: `was ${new Date(prev.startMs).toISOString()} → now ${new Date(next.startMs).toISOString()}`,
          detectedAt: nowIso,
        });
      }
    } else {
      // Counts differ: refuse to guess which old instance "became" which new
      // one. Report disappearances and additions instead — the student (or a
      // future smarter matcher) can resolve them; marks stay put.
      for (const prev of oldLeft) {
        removed.push(prev);
        changes.push({
          kind: 'removed',
          uid,
          summary: prev.summary,
          detail: 'disappeared from the calendar feed — kept here and flagged, not deleted',
          detectedAt: nowIso,
        });
      }
      for (const next of newLeft) {
        added.push(next);
        changes.push({
          kind: 'added',
          uid,
          summary: next.summary,
          detail: next.allDay ? 'all-day' : undefined,
          detectedAt: nowIso,
        });
      }
    }
  }

  return { changes, added, removed, timeMoved };
}
