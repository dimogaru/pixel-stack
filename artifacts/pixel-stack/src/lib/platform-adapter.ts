import { Capacitor } from '@capacitor/core';
import { beginAd, cancelPendingAds, type AdSession } from './ad-session';
import type { AdMobPlugin, InterstitialAdPluginEvents } from '@capacitor-community/admob';

// Control de Tiempos y Frecuencia
const TEN_MINUTES_MS = 10 * 60 * 1000;
const GAMES_BEFORE_FIRST_AD = 2;
const CRAZYGAMES_SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v2.js';

const ADMOB_INTERSTITIAL_ID = 'ca-app-pub-9984763727647656/4175470107';

type CordovaAdMob = {
  prepareInterstitial?: (
    options: { adId: string; autoShow: boolean; isTesting: boolean },
    onSuccess: () => void,
    onError: (error: unknown) => void,
  ) => void | Promise<unknown>;
  createInterstitial?: CordovaAdMob['prepareInterstitial'];
  showInterstitial?: () => void | Promise<unknown>;
};
type NativeAdWindow = Window & {
  plugins?: { AdMob?: CordovaAdMob };
  AdMob?: CordovaAdMob;
};

let admobPromise: Promise<AdMobPlugin> | null = null;
let preparation: Promise<void> | null = null;

function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

export function isNativeAdEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const nativeWindow = window as NativeAdWindow;
  return isNativePlatform() || Boolean(nativeWindow.plugins?.AdMob || nativeWindow.AdMob);
}

async function nativeAdMob(): Promise<AdMobPlugin> {
  if (!admobPromise) {
    admobPromise = import('@capacitor-community/admob')
      .then(async ({ AdMob }) => {
        await AdMob.initialize({ initializeForTesting: false, testingDevices: [] });
        return AdMob;
      })
      .catch((error: unknown) => {
        admobPromise = null;
        throw error;
      });
  }
  return admobPromise;
}

// Preload once; concurrent startup and GAME_OVER calls share the same preparation.
export function warmupNativeInterstitial(): Promise<void> {
  if (!isNativePlatform()) return Promise.resolve();
  if (!preparation) {
    preparation = nativeAdMob()
      .then((AdMob) => AdMob.prepareInterstitial({
        adId: ADMOB_INTERSTITIAL_ID,
        isTesting: false,
      }))
      .then(() => {})
      .catch((error: unknown) => {
        preparation = null;
        throw error;
      });
  }
  return preparation;
}

// Never load the AdMob plugin code in an ordinary web browser.
export async function requestAdMobInterstitial(session: AdSession): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const cleanups: Array<() => void | Promise<void>> = [];
  let attemptedShow = false;
  let actuallyShown = false;
  let settle!: () => void;
  const dismissed = new Promise<void>((resolve) => { settle = resolve; });
  try {
    if (session.signal.aborted) return false;
    const nativeWindow = window as NativeAdWindow;
    if (isNativePlatform()) {
      await warmupNativeInterstitial();
      if (session.signal.aborted) return false;
      const AdMob = await nativeAdMob();
      const listenerShown = await AdMob.addListener(
        'interstitialAdShowed' as InterstitialAdPluginEvents.Showed, () => {
        actuallyShown = true;
        session.markShown();
      });
      cleanups.push(() => listenerShown.remove());
      const listenerDismissed = await AdMob.addListener(
        'interstitialAdDismissed' as InterstitialAdPluginEvents.Dismissed, settle,
      );
      cleanups.push(() => listenerDismissed.remove());
      const listenerFailed = await AdMob.addListener(
        'interstitialAdFailedToShow' as InterstitialAdPluginEvents.FailedToShow, settle,
      );
      cleanups.push(() => listenerFailed.remove());
      if (session.signal.aborted) return false;
      try {
        attemptedShow = true;
        await AdMob.showInterstitial();
      } catch (error) {
        // If the SDK already displayed it, keep the lock until dismissal.
        if (actuallyShown) await dismissed;
        else throw error;
      }
      await dismissed;
      return true;
    }

    const cordovaAdMob = nativeWindow.plugins?.AdMob ?? nativeWindow.AdMob;
    const prepare = cordovaAdMob?.prepareInterstitial ?? cordovaAdMob?.createInterstitial;
    if (typeof prepare === 'function' && typeof cordovaAdMob?.showInterstitial === 'function') {
      const onDismiss = (event: Event) => {
        const adType = (event as CustomEvent<{ adType?: string }>).detail?.adType
          ?? (event as Event & { adType?: string }).adType;
        if (!adType || adType === 'interstitial') settle();
      };
      for (const event of ['onAdDismiss', 'onAdFailLoad', 'admob.interstitial.dismiss', 'admob.interstitial.showfail']) {
        document.addEventListener(event, onDismiss);
        cleanups.push(() => document.removeEventListener(event, onDismiss));
      }
      await new Promise<void>((resolve, reject) => {
        const pending = prepare.call(
          cordovaAdMob,
          { adId: ADMOB_INTERSTITIAL_ID, autoShow: false, isTesting: false },
          () => resolve(),
          reject,
        );
        // Support both callback-based Cordova and promise-based native bridges.
        if (pending) Promise.resolve(pending).then(() => resolve(), reject);
      });
      if (session.signal.aborted) return false;
      await cordovaAdMob.showInterstitial();
      session.markShown();
      await dismissed;
      return true;
    }
    console.log('AdMob skipped: browser or no compatible native AdMob bridge.');
  } catch (error) {
    console.warn('Native AdMob interstitial failed:', error);
  } finally {
    await Promise.all(cleanups.map(async (cleanup) => {
      try { await cleanup(); } catch (error) {
        console.warn('Could not remove AdMob listener:', error);
      }
    }));
    // Even a dismissed/cancelled presentation consumes the preloaded interstitial.
    if (attemptedShow) {
      preparation = null;
      void warmupNativeInterstitial().catch((error: unknown) => {
        console.warn('AdMob preload failed:', error);
      });
    }
  }
  return false;
}

type CrazyGamesSdk = {
  init?: () => Promise<void>;
  ad: {
    requestAd: (
      type: 'midroll',
      callbacks: {
        adStarted: () => void;
        adFinished: () => void;
        adError: (error: unknown) => void;
      },
    ) => void;
  };
  game: {
    gameplayStart: () => void;
    gameplayStop: () => void;
  };
};

declare global {
  interface Window {
    CrazyGames?: { SDK: CrazyGamesSdk };
  }
}

export const isCrazyGamesEnvironment = (
  pathname = window.location.pathname.toLowerCase(),
): boolean => pathname.includes('/crazygames') || pathname.endsWith('/crazygames.html');

let totalGamesPlayed = 0;
let lastAdAt = 0;
let crazyGamesInit: Promise<void> | null = null;

function loadCrazyGamesSdk(): Promise<void> {
  if (window.CrazyGames?.SDK) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${CRAZYGAMES_SDK_URL}"]`,
    );
    const script = existing ?? document.createElement('script');

    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('CrazyGames SDK failed to load')), {
      once: true,
    });

    if (!existing) {
      script.src = CRAZYGAMES_SDK_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

async function initializeCrazyGames(): Promise<void> {
  if (!isCrazyGamesEnvironment()) return;
  await loadCrazyGamesSdk();
  await window.CrazyGames?.SDK.init?.();
}

function ensureCrazyGamesInitialized(): Promise<void> {
  if (!crazyGamesInit) {
    crazyGamesInit = initializeCrazyGames().catch((error) => {
      console.warn('CrazyGames SDK initialization failed:', error);
    });
  }
  return crazyGamesInit;
}

// --- Control de Frecuencia ---
function shouldRequestAd(now: number): boolean {
  totalGamesPlayed += 1;

  // 1. Mostrar anuncio justo al terminar la 2ª partida
  if (totalGamesPlayed === GAMES_BEFORE_FIRST_AD) {
    return true;
  }

  // 2. A partir de la 2ª partida, mostrar si transcurrieron 10 minutos desde el último anuncio
  if (totalGamesPlayed > GAMES_BEFORE_FIRST_AD && lastAdAt > 0) {
    return now - lastAdAt >= TEN_MINUTES_MS;
  }

  return false;
}

function markAdRequested(now: number): void {
  lastAdAt = now;
}

async function requestCrazyGamesAd(): Promise<void> {
  const session = beginAd(TEN_MINUTES_MS);
  if (!session) return;
  try {
    await ensureCrazyGamesInitialized();
    if (session.signal.aborted || !window.CrazyGames?.SDK) return;
    await new Promise<void>((resolve) => {
      window.CrazyGames!.SDK.ad.requestAd('midroll', {
        adStarted: session.markShown,
        adFinished: resolve,
        adError: (error) => {
          console.warn('CrazyGames midroll failed:', error);
          resolve();
        },
      });
    });
  } catch (error) {
    console.warn('CrazyGames midroll failed:', error);
  } finally {
    session.finish();
  }
}

export const gamePlatform = {
  isCrazyGames: isCrazyGamesEnvironment(),
  isNative: isNativeAdEnvironment(),
  fullscreenEnabled: !isCrazyGamesEnvironment(),

  initialize(): void {
    if (this.isCrazyGames) void ensureCrazyGamesInitialized();
    if (this.isNative) {
      void warmupNativeInterstitial().catch((error: unknown) => {
        console.warn('AdMob initialization or preload failed:', error);
      });
    }
  },

  runStarted(): void {
    cancelPendingAds();
    if (this.isCrazyGames) {
      void ensureCrazyGamesInitialized().then(() => {
        window.CrazyGames?.SDK.game.gameplayStart();
      });
      const now = Date.now();
      if (!shouldRequestAd(now)) return;
      markAdRequested(now);
      void requestCrazyGamesAd();
    }
  },

  runStopped(): void {
    if (this.isCrazyGames) {
      void ensureCrazyGamesInitialized().then(() => {
        window.CrazyGames?.SDK.game.gameplayStop();
      });
    }

    // AdMob is requested only by adsenseGameAds.tryShowGameOverAd().
  },
};
