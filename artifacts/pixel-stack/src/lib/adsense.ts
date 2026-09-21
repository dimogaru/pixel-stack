const AD_COOLDOWN_MS = 8 * 60 * 1000;

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

let hasPlayedFirstGame = false;
let lastAdTimestamp = 0;

export const adsenseGameAds = {
  shouldShowAd(now = Date.now()): boolean {
    return !hasPlayedFirstGame || now - lastAdTimestamp >= AD_COOLDOWN_MS;
  },

  showGameOverAd(
    onComplete: () => void,
    audio: { pause: () => void; resume: () => void },
  ): void {
    const now = Date.now();
    if (!this.shouldShowAd(now)) {
      onComplete();
      return;
    }

    hasPlayedFirstGame = true;
    lastAdTimestamp = now;

    let completed = false;
    const completeOnce = () => {
      if (completed) return;
      completed = true;
      audio.resume();
      onComplete();
    };

    if (typeof window.adBreak !== 'function') {
      completeOnce();
      return;
    }

    try {
      window.adBreak({
        type: 'next',
        name: 'game_over',
        beforeAd: audio.pause,
        afterAd: completeOnce,
        adBreakDone: completeOnce,
      });
    } catch (error) {
      console.warn('AdSense game-over ad failed:', error);
      completeOnce();
    }
  },
};