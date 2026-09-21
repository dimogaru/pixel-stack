const TEN_MINUTES_MS = 10 * 60 * 1000;
const GAMES_PER_AD = 3;
const CRAZYGAMES_SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v2.js';

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

let gamesSinceAd = 0;
let lastAdAt = Date.now();
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

function shouldRequestAd(now: number): boolean {
  gamesSinceAd += 1;
  return gamesSinceAd >= GAMES_PER_AD || now - lastAdAt >= TEN_MINUTES_MS;
}

function markAdRequested(now: number): void {
  gamesSinceAd = 0;
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
  fullscreenEnabled: !isCrazyGamesEnvironment(),

  initialize(): void {
    if (this.isCrazyGames) void ensureCrazyGamesInitialized();
  },

  runStarted(): void {
    if (!this.isCrazyGames) return;

    void ensureCrazyGamesInitialized().then(() => {
      window.CrazyGames?.SDK.game.gameplayStart();
    });
    const now = Date.now();
    if (!shouldRequestAd(now)) return;
    markAdRequested(now);
    void requestCrazyGamesAd();
  },

  runStopped(): void {
    if (!this.isCrazyGames) return;
    void ensureCrazyGamesInitialized().then(() => {
      window.CrazyGames?.SDK.game.gameplayStop();
    });
  },
};