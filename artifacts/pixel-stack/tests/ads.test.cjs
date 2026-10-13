const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((ok) => { resolve = ok; });
  return { promise, resolve };
};

function environment(native = false) {
  let now = 1_000_000;
  const events = new Map();
  const calls = { imported: 0, initialize: 0, prepare: 0, show: 0, web: 0, pause: 0, resume: 0 };
  const document = new EventTarget();
  const window = { location: { pathname: '/' } };
  const sdk = {
    async initialize(options) {
      calls.initialize++;
      assert.equal(options.initializeForTesting, false);
      assert.deepEqual(Array.from(options.testingDevices), []);
    },
    async prepareInterstitial({ adId, isTesting }) {
      calls.prepare++;
      assert.equal(adId, 'ca-app-pub-9984763727647656/4175470107');
      assert.equal(isTesting, false);
    },
    async showInterstitial() {
      calls.show++;
      events.get('interstitialAdShowed')?.();
    },
    async addListener(event, callback) {
      events.set(event, callback);
      return { async remove() { events.delete(event); } };
    },
  };
  const context = vm.createContext({
    window, document, AbortController,
    Date: { now: () => now },
    console: { log() {}, warn() {} },
  });
  const modules = new Map();
  function load(name) {
    const filename = path.resolve(__dirname, '../src/lib', `${name}.ts`);
    if (modules.has(filename)) return modules.get(filename);
    const exports = {};
    modules.set(filename, exports);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const run = vm.runInContext(`(function(require, exports) { ${source}\n})`, context);
    run((dependency) => {
      if (dependency === '@capacitor/core') {
        return { Capacitor: {
          isNativePlatform: () => native,
          getPlatform: () => native ? 'android' : 'web',
        } };
      }
      if (dependency === '@capacitor-community/admob') {
        calls.imported++;
        return { AdMob: sdk };
      }
      return load(dependency.replace('./', ''));
    }, exports);
    return exports;
  }
  const { adsenseGameAds: ads } = load('adsense');
  const { gamePlatform } = load('platform-adapter');
  const audio = {
    pause() { calls.pause++; },
    resume() { calls.resume++; },
  };
  return {
    ads, gamePlatform, audio, sdk, window, document, calls, events,
    advance: (ms) => { now += ms; },
    dismiss: () => events.get('interstitialAdDismissed')?.(),
  };
}

test('Android manifest declares the production AdMob application ID exactly once', () => {
  const manifest = fs.readFileSync(
    path.resolve(__dirname, '../android/app/src/main/AndroidManifest.xml'), 'utf8',
  );
  const application = manifest.match(/<application\b[^>]*>([\s\S]*?)<\/application>/);
  assert.ok(application, 'application element must exist');
  const metadata = application[1].match(
    /<meta-data\b[^>]*android:name="com\.google\.android\.gms\.ads\.APPLICATION_ID"[^>]*\/>/g,
  ) ?? [];
  assert.equal(metadata.length, 1, 'do not duplicate AdMob application metadata');
  assert.match(metadata[0], /android:value="ca-app-pub-9984763727647656~5245009196"/);
});

test('Android preloads once on launch and shows only on the first GAME_OVER', async () => {
  const e = environment(true);
  e.gamePlatform.initialize();
  await tick();
  assert.equal(e.calls.initialize, 1);
  assert.equal(e.calls.prepare, 1);
  e.gamePlatform.runStarted();
  e.gamePlatform.runStopped();
  assert.equal(e.calls.show, 0);
  const first = e.ads.tryShowGameOverAd(() => {}, e.audio);
  await tick();
  assert.equal(e.calls.show, 1);
  assert.equal(e.calls.prepare, 1, 'reuse preload rather than load twice');
  e.dismiss();
  await first;
  await tick();
  assert.equal(e.calls.prepare, 2, 'preload next after closing the first');
  assert.equal(e.events.size, 0, 'remove native listeners after dismissal');
  assert.equal(e.calls.pause, e.calls.resume);
});

test('native cooldown is seven minutes from the actual shown event, not from dismissal', async () => {
  const e = environment(true);
  e.gamePlatform.initialize();
  await tick();
  const first = e.ads.tryShowGameOverAd(() => {}, e.audio);
  await tick();
  e.advance(3 * 60_000);
  e.dismiss();
  await first;
  await tick();
  e.advance(4 * 60_000 - 1);
  await e.ads.tryShowGameOverAd(() => {}, e.audio);
  assert.equal(e.calls.show, 1);
  e.advance(1);
  const second = e.ads.tryShowGameOverAd(() => {}, e.audio);
  await tick();
  assert.equal(e.calls.show, 2);
  e.dismiss();
  await second;
});

test('native lock blocks simultaneous GAME_OVER requests during preload and presentation', async () => {
  const e = environment(true);
  const loading = deferred();
  e.sdk.prepareInterstitial = async () => { e.calls.prepare++; await loading.promise; };
  e.gamePlatform.initialize();
  const first = e.ads.tryShowGameOverAd(() => {}, e.audio);
  await tick();
  await e.ads.tryShowGameOverAd(() => {}, e.audio);
  assert.equal(e.calls.prepare, 1);
  assert.equal(e.calls.show, 0);
  loading.resolve();
  await tick();
  assert.equal(e.calls.show, 1);
  e.advance(10 * 60_000);
  await e.ads.tryShowGameOverAd(() => {}, e.audio);
  assert.equal(e.calls.show, 1, 'do not unlock while the ad is visible');
  e.dismiss();
  await first;
});

test('restart during preload suppresses late show and permits retry after failure delay', async () => {
  const e = environment(true);
  const loading = deferred();
  e.sdk.prepareInterstitial = async () => { e.calls.prepare++; await loading.promise; };
  e.gamePlatform.initialize();
  const first = e.ads.tryShowGameOverAd(() => {}, e.audio);
  await tick();
  e.ads.cancelPending();
  e.advance(11 * 60_000);
  await e.ads.tryShowGameOverAd(() => {}, e.audio);
  assert.equal(e.calls.prepare, 1, 'cancelling does not unlock in-flight SDK work');
  loading.resolve();
  await first;
  assert.equal(e.calls.show, 0);
  assert.equal(e.events.size, 0);
  const next = e.ads.tryShowGameOverAd(() => {}, e.audio);
  await tick();
  assert.equal(e.calls.show, 1);
  e.dismiss();
  await next;
});

test('navigation during a shown native ad retains lock until SDK dismissal', async () => {
  const e = environment(true);
  let completed = 0;
  const first = e.ads.tryShowGameOverAd(() => { completed++; }, e.audio);
  await tick();
  assert.equal(e.calls.show, 1);
  e.ads.cancelPending();
  e.advance(10 * 60_000);
  await e.ads.tryShowGameOverAd(() => {}, e.audio);
  assert.equal(e.calls.show, 1);
  e.dismiss();
  await first;
  assert.equal(completed, 0);
  assert.equal(e.events.size, 0);
});

test('SDK initialization failure is handled at startup and GAME_OVER, then can retry', async () => {
  const e = environment(true);
  e.sdk.initialize = async () => {
    e.calls.initialize++;
    throw new Error('SDK initialization failed');
  };
  e.gamePlatform.initialize();
  await tick();
  assert.equal(e.calls.initialize, 1);
  assert.equal(e.calls.prepare, 0);
  let completed = 0;
  await e.ads.tryShowGameOverAd(() => { completed++; }, e.audio);
  assert.equal(completed, 1, 'continue the game-over flow despite the SDK failure');
  assert.equal(e.calls.pause, e.calls.resume);
  assert.equal(e.calls.show, 0);
  e.advance(30_000);
  e.sdk.initialize = async () => { e.calls.initialize++; };
  const retry = e.ads.tryShowGameOverAd(() => {}, e.audio);
  await tick();
  assert.equal(e.calls.show, 1);
  e.dismiss();
  await retry;
});

test('native preload failures do not call the web provider and throttle retries', async () => {
  const e = environment(true);
  e.window.adBreak = () => { e.calls.web++; };
  e.sdk.prepareInterstitial = async () => {
    e.calls.prepare++;
    throw new Error('no fill');
  };
  await e.ads.tryShowGameOverAd(() => {}, e.audio);
  await e.ads.tryShowGameOverAd(() => {}, e.audio);
  assert.equal(e.calls.prepare, 1);
  assert.equal(e.calls.web, 0);
  assert.equal(e.calls.show, 0);
  e.advance(30_000);
  await e.ads.tryShowGameOverAd(() => {}, e.audio);
  assert.equal(e.calls.prepare, 2);
});

test('failed native presentation does not count as an ad shown', async () => {
  const e = environment(true);
  e.sdk.showInterstitial = async () => {
    e.calls.show++;
    throw new Error('SDK could not show');
  };
  await e.ads.tryShowGameOverAd(() => {}, e.audio);
  await tick();
  assert.equal(e.calls.show, 1);
  assert.equal(e.events.size, 0);
  e.advance(30_000);
  const retry = e.ads.tryShowGameOverAd(() => {}, e.audio);
  await retry;
  assert.equal(e.calls.show, 2, 'a failure is throttled briefly, not for seven minutes');
});

test('browser does not initialize/import AdMob and retains its web 8-minute cadence', async () => {
  const e = environment();
  let config;
  e.window.adBreak = (value) => { config = value; e.calls.web++; };
  e.gamePlatform.initialize();
  const first = e.ads.tryShowGameOverAd(() => {}, e.audio);
  assert.equal(e.calls.imported, 0);
  assert.equal(e.calls.prepare, 0);
  config.beforeAd();
  config.afterAd();
  await e.ads.tryShowGameOverAd(() => {}, e.audio);
  assert.equal(e.calls.web, 1, 'web lock lasts until adBreakDone');
  config.adBreakDone();
  await first;
  config.beforeAd();
  assert.equal(e.calls.pause, 1, 'late callbacks cannot mute gameplay');
  e.advance(8 * 60_000);
  const next = e.ads.tryShowGameOverAd(() => {}, e.audio);
  assert.equal(e.calls.web, 2);
  config.adBreakDone();
  await next;
  assert.equal(e.calls.imported, 0, 'native plugin must never load in browser');
});

test('Cordova manual bridge remains supported without importing the Capacitor plugin', async () => {
  const e = environment();
  let loaded;
  let options;
  e.window.plugins = { AdMob: {
    prepareInterstitial(value, callback) { options = value; loaded = callback; },
    showInterstitial() { e.calls.show++; },
  } };
  const pending = e.ads.tryShowGameOverAd(() => {}, e.audio);
  assert.equal(options.autoShow, false);
  assert.equal(options.isTesting, false);
  assert.equal(options.adId, 'ca-app-pub-9984763727647656/4175470107');
  loaded();
  await tick();
  assert.equal(e.calls.show, 1);
  e.document.dispatchEvent(new Event('onAdDismiss'));
  await pending;
  assert.equal(e.calls.prepare, 0);
});
