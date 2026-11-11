/**
 * Sync diff tests — the "changes" feature. Key principle under test:
 * an event disappearing from a feed is flagged, NOT deleted.
 */

import { describe, expect, it } from 'vitest';
import { diffSnapshots } from '../src/sync.js';
import type { CalEvent } from '../src/types.js';

const NOW_ISO = '2026-11-11T02:00:00.000Z';

function ev(id: string, summary: string, startMs: number, uid = id): CalEvent {
  return { id, uid, summary, startMs, endMs: startMs + 3600000, allDay: false, cancelled: false };
}

const T1 = new Date('2026-11-12T06:30:00Z').getTime();
const T2 = new Date('2026-11-14T00:30:00Z').getTime();

describe('diffSnapshots', () => {
  it('detects newly added events', () => {
    const { changes, added, removed } = diffSnapshots([ev('a', 'Old', T1)], [ev('a', 'Old', T1), ev('b', 'New quiz', T2)], NOW_ISO);
    expect(added).toHaveLength(1);
    expect(added[0].summary).toBe('New quiz');
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe('added');
    expect(removed).toHaveLength(0);
  });

  it('detects time changes', () => {
    const { changes } = diffSnapshots([ev('a', 'Quiz', T1)], [ev('a', 'Quiz', T1 + 2 * 3600000)], NOW_ISO);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe('time-changed');
    expect(changes[0].detail).toContain('2026-11-12T06:30:00.000Z');
    expect(changes[0].detail).toContain('2026-11-12T08:30:00.000Z');
  });

  it('detects title changes', () => {
    const { changes } = diffSnapshots([ev('a', 'Assignment 1', T1)], [ev('a', 'Assignment 1 (updated)', T1)], NOW_ISO);
    expect(changes[0].kind).toBe('title-changed');
    expect(changes[0].detail).toContain('Assignment 1');
  });

  it('events removed from the feed are kept and flagged, never silently deleted', () => {
    const old = [ev('a', 'Kept', T1), ev('b', 'Vanished essay', T2)];
    const { changes, added, removed } = diffSnapshots(old, [ev('a', 'Kept', T1)], NOW_ISO);
    expect(added).toHaveLength(0);
    expect(removed).toHaveLength(1);
    expect(removed[0].summary).toBe('Vanished essay');
    expect(changes[0].kind).toBe('removed');
    expect(changes[0].detail).toMatch(/kept here and flagged/i);
  });

  it('recurring instances with same uid+start produce no spurious diffs', () => {
    const recurring = (offsetMs: number) => [
      ev('r/1', 'Lab', T1 + offsetMs, 'r'),
      ev('r/2', 'Lab', T2 + offsetMs, 'r'),
    ];
    const { changes } = diffSnapshots(recurring(0), recurring(0), NOW_ISO);
    expect(changes).toHaveLength(0);
  });

  it('no changes when snapshots identical', () => {
    const snap = [ev('a', 'Same', T1), ev('b', 'Also same', T2)];
    const { changes, added, removed } = diffSnapshots(snap, snap, NOW_ISO);
    expect(changes).toHaveLength(0);
    expect(added).toHaveLength(0);
    expect(removed).toHaveLength(0);
  });
});
