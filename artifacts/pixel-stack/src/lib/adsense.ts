import { isNativeAdEnvironment, requestAdMobInterstitial } from './platform-adapter';
import { beginAd, canRequestAd, cancelPendingAds, lastAdShownTimestamp } from './ad-session';

const WEB_COOLDOWN_MS = 8 * 60 * 1000;
const NATIVE_COOLDOWN_MS = 7 * 60 * 1000;
let isFirstGameCompleted = false;

type AdBreakConfig = {
  type: 'next';
  name: 'game_over';
  beforeAd: () => void;
  afterAd: () => void;
  adBreakDone: () => void;
};

declare global {
  interface Window {
    adsbygoogle?: unknown[];
    adBreak?: (config: AdBreakConfig) => void;
  }
}

export const adsenseGameAds = {
  cancelPending: cancelPendingAds,

  shouldShowAd(): boolean {
    return canRequestAd(isNativeAdEnvironment() ? NATIVE_COOLDOWN_MS : WEB_COOLDOWN_MS);
  },

  async tryShowGameOverAd(
    onComplete: () => void,
    audio: { pause: () => void; resume: () => void },
  ): Promise<void> {
    const native = isNativeAdEnvironment();
    if (native) {
      const isFirst = !isFirstGameCompleted;
      isFirstGameCompleted = true;
      const lastAdShown = lastAdShownTimestamp();
      if (!isFirst && lastAdShown !== null && Date.now() - lastAdShown < NATIVE_COOLDOWN_MS) {
        onComplete();
        return;
      }
    }
    const session = beginAd(native ? NATIVE_COOLDOWN_MS : WEB_COOLDOWN_MS, !native);
    if (!session) {
      onComplete();
      return;
    }

    let muted = false;
    let cancelled = false;
    const resume = () => {
      if (!muted) return;
      muted = false;
      audio.resume();
    };
    const pause = () => {
      if (session.signal.aborted || muted) return;
      muted = true;
      audio.pause();
    };
    const onCancel = () => {
      cancelled = true;
      resume();
    };
    session.signal.addEventListener('abort', onCancel, { once: true });

    try {
      if (native) {
        pause();
        await requestAdMobInterstitial(session);
        // Never fall back to a second provider after native failure/cancellation.
      } else if (typeof window.adBreak === 'function') {
        await new Promise<void>((resolve) => {
          window.adBreak!({
            type: 'next',
            name: 'game_over',
            beforeAd: () => {
              session.markShown();
              pause();
            },
            afterAd: resume,
            // afterAd may run before adBreakDone: keep the lock until terminal.
            adBreakDone: resolve,
          });
        });
      } else {
        console.log('Game-over ad skipped: no browser ad provider.');
      }
    } catch (error) {
      console.warn('Game-over ad failed:', error);
    } finally {
      session.signal.removeEventListener('abort', onCancel);
      resume();
      session.finish();
      if (!cancelled) onComplete();
    }
  },
};
