/**
 * UniFlow Core — notification channel interface.
 *
 * v0.1.0 ships exactly ONE channel: the in-app daily digest. It is
 * deterministic, needs no permissions, and is actually testable.
 *
 * Future channels (Telegram bot, email via user-owned GitHub Actions,
 * web push) implement this same interface. NOTE: browser push on iOS
 * requires the app to be installed to the home screen (PWA) AND granted
 * permission; scheduled background push is NOT reliably possible from a
 * plain web page — any future channel README must say so plainly.
 */

import type { Digest } from './rules.js';

export interface NotificationChannel {
  readonly id: string;
  readonly name: string;
  /** Whether this channel works with zero accounts/tokens/APIs. */
  readonly zeroSetup: boolean;
  /** Verify the channel is usable right now (never throws). */
  isAvailable(): Promise<boolean>;
  /** Deliver a digest. Returns false with a reason on failure. */
  send(digest: Digest): Promise<{ ok: boolean; reason?: string }>;
}

/**
 * In-app digest channel: renders in the UI and is copyable.
 * This is the only channel enabled by default in v0.1.0.
 */
export class InAppDigestChannel implements NotificationChannel {
  readonly id = 'in-app-digest';
  readonly name = 'In-app daily digest';
  readonly zeroSetup = true;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async send(digest: Digest): Promise<{ ok: boolean; reason?: string }> {
    // The UI renders digest.text; nothing to do here beyond validating it.
    if (!digest.text || digest.lines.length === 0) {
      return { ok: false, reason: 'digest was empty' };
    }
    return { ok: true };
  }
}

/**
 * Scheduled delivery interface — NOT implemented in v0.1.0.
 * Real scheduled sending requires either:
 *  - a user-owned automation runner (e.g. their own GitHub Actions fork), or
 *  - a PWA + service worker, which still cannot wake themselves reliably on iOS.
 * Until one is tested end-to-end, UniFlow will not claim scheduled push works.
 */
export interface Scheduler {
  /** Next scheduled run in epoch ms, or null if scheduling is unavailable. */
  nextRun(): number | null;
}
