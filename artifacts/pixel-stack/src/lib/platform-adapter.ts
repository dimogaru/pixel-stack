import { beginAd, cancelPendingAds, type AdSession } from './ad-session';

// Control de Tiempos y Frecuencia
const TEN_MINUTES_MS = 10 * 60 * 1000;
const GAMES_BEFORE_FIRST_AD = 2;
const CRAZYGAMES_SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v2.js';

const ADMOB_INTERSTITIAL_ID = 'ca-app-pub-9984763727647656/4175470107';

type CapacitorAdMob = {
  initialize?: () => Promise<void>;
  prepareInterstitial: (options: { adId: string }) => Promise<unknown>;
  showInterstitial: () => Promise<unknown>;
  addListener: (
    event: string,
    callback: () => void,
  ) => Promise<{ remove: () => Promise<void> }> | { remove: () => Promise<void> };
};
type CordovaAdMob = {
  prepareInterstitial?: (
    options: { adId: string; autoShow: boolean },
    onSuccess: () => void,
    onError: (error: unknown) => void,
  ) => void | Promise<unknown>;
  createInterstitial?: CordovaAdMob['prepareInterstitial'];
  showInterstitial?: () => void | Promise<unknown>;
};
type NativeAdWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
    Plugins?: { AdMob?: CapacitorAdMob };
  };
  plugins?: { AdMob?: CordovaAdMob };
  AdMob?: CordovaAdMob;
};

let adMobInitialized = false;

function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const capacitor = (window as NativeAdWindow).Capacitor;
    return capacitor?.isNativePlatform?.()
      ?? ['android', 'ios'].includes(capacitor?.getPlatform?.() ?? 'web');
  } catch {
    return false;
  }
}

export function isNativeAdEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const nativeWindow = window as NativeAdWindow;
  return isNativePlatform() || Boolean(nativeWindow.plugins?.AdMob || nativeWindow.AdMob);
}

// Only use an injected native bridge; never import or load a native SDK on web.
export async function requestAdMobInterstitial(session: AdSession): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const cleanups: Array<() => void | Promise<void>> = [];
  let settle!: () => void;
  const dismissed = new Promise<void>((resolve) => { settle = resolve; });
  try {
    if (session.signal.aborted) return false;
    const nativeWindow = window as NativeAdWindow;
    const capacitor = nativeWindow.Capacitor;
    const capacitorAdMob = capacitor?.Plugins?.AdMob;
    if (isNativePlatform() && typeof capacitorAdMob?.prepareInterstitial === 'function'
      && typeof capacitorAdMob.showInterstitial === 'function'
      && typeof capacitorAdMob.addListener === 'function') {
      for (const event of ['interstitialAdDismissed', 'interstitialAdFailedToShow']) {
        const listener = await capacitorAdMob.addListener(event, settle);
        cleanups.push(() => listener.remove());
      }
      if (session.signal.aborted) return false;
      if (!adMobInitialized) {
        await capacitorAdMob.initialize?.();
        adMobInitialized = true;
      }
      if (session.signal.aborted) return false;
      await capacitorAdMob.prepareInterstitial({ adId: ADMOB_INTERSTITIAL_ID });
      if (session.signal.aborted) return false;
      await capacitorAdMob.showInterstitial();
      session.markShown();
      // showInterstitial resolves when presentation starts, not when it closes.
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
          { adId: ADMOB_INTERSTITIAL_ID, autoShow: false },
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

    // AdMob is requested only by adsenseGameAds.showGameOverAd().
  },
};
