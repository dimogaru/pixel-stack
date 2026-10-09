import { Capacitor } from '@capacitor/core';
import { AdMob } from '@capacitor-community/admob';

// Control de Tiempos y Frecuencia
const TEN_MINUTES_MS = 10 * 60 * 1000;
const GAMES_BEFORE_FIRST_AD = 2;
const CRAZYGAMES_SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v2.js';

const ADMOB_INTERSTITIAL_ID = 'ca-app-pub-9984763727647656/4175470107';

type CapacitorAdMob = {
  initialize?: () => Promise<void>;
  prepareInterstitial: (options: { adId: string }) => Promise<unknown>;
  showInterstitial: () => Promise<unknown>;
};
type CordovaAdMob = {
  prepareInterstitial?: (
    options: { adId: string; autoShow: boolean },
    onSuccess: () => void,
    onError: (error: unknown) => void,
  ) => void | Promise<unknown>;
  createInterstitial?: CordovaAdMob['prepareInterstitial'];
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

// Only use an injected native bridge; never import or load a native SDK on web.
export async function requestAdMobInterstitial(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const nativeWindow = window as NativeAdWindow;
    const capacitor = nativeWindow.Capacitor;
    const isNative = capacitor?.isNativePlatform?.()
      ?? (capacitor?.getPlatform?.() === 'android' || capacitor?.getPlatform?.() === 'ios');
    const capacitorAdMob = capacitor?.Plugins?.AdMob;
    if (isNative && typeof capacitorAdMob?.prepareInterstitial === 'function'
      && typeof capacitorAdMob.showInterstitial === 'function') {
      if (!adMobInitialized) {
        await capacitorAdMob.initialize?.();
        adMobInitialized = true;
      }
      await capacitorAdMob.prepareInterstitial({ adId: ADMOB_INTERSTITIAL_ID });
      await capacitorAdMob.showInterstitial();
      return true;
    }

    const cordovaAdMob = nativeWindow.plugins?.AdMob ?? nativeWindow.AdMob;
    const prepare = cordovaAdMob?.prepareInterstitial ?? cordovaAdMob?.createInterstitial;
    if (typeof prepare === 'function') {
      await prepare.call(
        cordovaAdMob,
        { adId: ADMOB_INTERSTITIAL_ID, autoShow: true },
        () => {},
        (error) => console.warn('Native AdMob interstitial failed:', error),
      );
      return true;
    }
    console.log('AdMob skipped: browser or no compatible native AdMob bridge.');
  } catch (error) {
    console.warn('Native AdMob interstitial failed:', error);
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
let admobInit: Promise<void> | null = null;

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

// --- AdMob Helpers ---
async function initializeAdMob(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await AdMob.initialize();
    await AdMob.prepareInterstitial({
      adId: INTERSTITIAL_AD_ID,
    });
  } catch (error) {
    console.warn('AdMob initialization failed:', error);
  }
}

function ensureAdMobInitialized(): Promise<void> {
  if (!admobInit) {
    admobInit = initializeAdMob();
  }
  return admobInit;
}

async function showAdMobInterstitial(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await ensureAdMobInitialized();
    await AdMob.showInterstitial();
    // Precargar el siguiente anuncio para la próxima ocasión
    await AdMob.prepareInterstitial({
      adId: INTERSTITIAL_AD_ID,
    });
  } catch (error) {
    console.warn('AdMob interstitial failed:', error);
  }
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
  await ensureCrazyGamesInitialized();
  window.CrazyGames?.SDK.ad.requestAd('midroll', {
    adStarted: () => {},
    adFinished: () => {},
    adError: (error) => console.warn('CrazyGames midroll failed:', error),
  });
}

export const gamePlatform = {
  isCrazyGames: isCrazyGamesEnvironment(),
  isNative: Capacitor.isNativePlatform(),
  fullscreenEnabled: !isCrazyGamesEnvironment(),

  initialize(): void {
    if (this.isCrazyGames) void ensureCrazyGamesInitialized();
    if (this.isNative) void ensureAdMobInitialized();
  },

  runStarted(): void {
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

    // Al perder la partida (Game Over) en Android / iOS
    if (this.isNative) {
      const now = Date.now();
      if (shouldRequestAd(now)) {
        markAdRequested(now);
        void showAdMobInterstitial();
      }
    }
  },
};
