// Shared by all providers. Cancelling does not unlock an SDK call still in flight.
export type AdSession = {
  signal: AbortSignal;
  markShown: () => void;
  finish: () => void;
};

let active: AbortController | null = null;
let lastShownAt: number | null = null;
let lastAttemptAt: number | null = null;
const RETRY_DELAY_MS = 30_000;

export function canRequestAd(cooldownMs: number, now = Date.now()): boolean {
  return !active
    && (lastShownAt === null || now - lastShownAt >= cooldownMs)
    && (lastAttemptAt === null || now - lastAttemptAt >= RETRY_DELAY_MS);
}

export function lastAdShownTimestamp(): number | null {
  return lastShownAt;
}

export function beginAd(cooldownMs: number, cooldownFromDismissal = true): AdSession | null {
  if (!canRequestAd(cooldownMs)) return null;
  const controller = new AbortController();
  active = controller;
  lastAttemptAt = Date.now();
  let shown = false;
  return {
    signal: controller.signal,
    markShown() {
      if (active !== controller) return;
      shown = true;
      lastShownAt = Date.now();
    },
    finish() {
      if (active !== controller) return;
      // Count the interval from dismissal, not from the start of loading.
      if (shown && cooldownFromDismissal) lastShownAt = Date.now();
      active = null;
      controller.abort();
    },
  };
}

export function cancelPendingAds(): void {
  active?.abort();
}
