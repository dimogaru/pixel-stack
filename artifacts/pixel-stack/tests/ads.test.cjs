const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
};

function environment(native = false) {
  let now = 1_000_000;
  const events = new Map();
  const calls = { initialize: 0, prepare: 0, show: 0, web: 0, pause: 0, resume: 0 };
  const document = new EventTarget();
  const window = { location: { pathname: '/' } };
  const sdk = {
    async initialize() { calls.initialize++; },
    async prepareInterstitial(options) {
      calls.prepare++;
      assert.equal(options.adId, 'ca-app-pub-9984763727647656/4175470107');
    },
    async showInterstitial() { calls.show++; },
    async addListener(event, callback) {
      events.set(event, callback);
      return { async remove() { events.delete(event); } };
    },
  };
  if (native) window.Capacitor = {
    isNativePlatform: () => true,
    Plugins: { AdMob: sdk },
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
    run((dependency) => load(dependency.replace('./', '')), exports);
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

test('native: one caller, lock throughout loading/showing, 10 minutes from dismissal', async () => {
  const e = environment(true);
  e.gamePlatform.initialize();
  await e.ads.showGameOverAd(() => {}, e.audio);
  assert.equal(e.calls.prepare, 0, 'no native preload or first-game ad');
  const loading = deferred();
  e.sdk.prepareInterstitial = async () => { e.calls.prepare++; await loading.promise; };
  e.gamePlatform.runStopped();
  const first = e.ads.showGameOverAd(() => {}, e.audio);
  await tick();
  await e.ads.showGameOverAd(() => {}, e.audio);
  assert.equal(e.calls.prepare, 1);
  loading.resolve();
  await tick();
  assert.equal(e.calls.show, 1);
  e.advance(20 * 60_000);
  await e.ads.showGameOverAd(() => {}, e.audio);
  assert.equal(e.calls.show, 1, 'lock remains despite cooldown passing while showing');
  e.dismiss();
  await first;
  assert.equal(e.events.size, 0, 'all native listeners removed');
  e.advance(10 * 60_000 - 1);
  await e.ads.showGameOverAd(() => {}, e.audio);
  assert.equal(e.calls.show, 1);
  e.advance(1);
  const next = e.ads.showGameOverAd(() => {}, e.audio);
  await tick();
  assert.equal(e.calls.show, 2);
  e.dismiss();
  await next;
  assert.equal(e.calls.initialize, 1);
  assert.equal(e.calls.prepare, 2, 'no redundant preload after dismissal');
  assert.equal(e.calls.pause, e.calls.resume);
});

test('restart cancels native loading, prevents late show, and suppresses stale completion', async () => {
  const e = environment(true);
  await e.ads.showGameOverAd(() => {}, e.audio);
  const loading = deferred();
  e.sdk.prepareInterstitial = async () => { e.calls.prepare++; await loading.promise; };
  let completed = 0;
  const pending = e.ads.showGameOverAd(() => { completed++; }, e.audio);
  await tick();
  e.ads.cancelPending();
  e.ads.cancelPending();
  e.advance(11 * 60_000);
  await e.ads.showGameOverAd(() => {}, e.audio);
  assert.equal(e.calls.prepare, 1, 'abort does not unlock unfinished SDK work');
  loading.resolve();
  await pending;
  assert.equal(e.calls.show, 0);
  assert.equal(completed, 0);
  assert.equal(e.events.size, 0);
  assert.equal(e.calls.resume, 1);
  const next = e.ads.showGameOverAd(() => {}, e.audio);
  await tick();
  assert.equal(e.calls.show, 1);
  e.dismiss();
  await next;
});

test('navigation during a native ad retains the lock until native dismissal', async () => {
  const e = environment(true);
  await e.ads.showGameOverAd(() => {}, e.audio);
  let completed = 0;
  const pending = e.ads.showGameOverAd(() => { completed++; }, e.audio);
  await tick();
  e.ads.cancelPending();
  e.advance(11 * 60_000);
  await e.ads.showGameOverAd(() => {}, e.audio);
  assert.equal(e.calls.show, 1);
  e.dismiss();
  await pending;
  assert.equal(completed, 0);
  assert.equal(e.events.size, 0);
});

test('native loading errors unlock safely, never fall back to AdSense, and throttle retries', async () => {
  const e = environment(true);
  e.window.adBreak = () => { e.calls.web++; };
  await e.ads.showGameOverAd(() => {}, e.audio);
  e.sdk.prepareInterstitial = async () => {
    e.calls.prepare++;
    throw new Error('no fill');
  };
  await e.ads.showGameOverAd(() => {}, e.audio);
  await e.ads.showGameOverAd(() => {}, e.audio);
  assert.equal(e.calls.prepare, 1);
  assert.equal(e.calls.web, 0);
  assert.equal(e.events.size, 0);
  e.advance(30_000);
  await e.ads.showGameOverAd(() => {}, e.audio);
  assert.equal(e.calls.prepare, 2);
});

test('web: lock survives afterAd, finishes once, and stale callbacks cannot mute new gameplay', async () => {
  const e = environment();
  let config;
  e.window.adBreak = (value) => { config = value; e.calls.web++; };
  let completed = 0;
  const first = e.ads.showGameOverAd(() => { completed++; }, e.audio);
  config.beforeAd();
  config.afterAd();
  await e.ads.showGameOverAd(() => {}, e.audio);
  assert.equal(e.calls.web, 1);
  config.adBreakDone();
  config.adBreakDone();
  await first;
  assert.equal(completed, 1);
  assert.equal(e.calls.pause, 1);
  config.beforeAd();
  config.afterAd();
  assert.equal(e.calls.pause, 1, 'finished callbacks are invalidated');
  e.advance(8 * 60_000 - 1);
  await e.ads.showGameOverAd(() => {}, e.audio);
  assert.equal(e.calls.web, 1);
  e.advance(1);
  const next = e.ads.showGameOverAd(() => {}, e.audio);
  assert.equal(e.calls.web, 2);
  config.adBreakDone();
  await next;
  assert.equal(e.calls.prepare, 0, 'browser never calls AdMob');
});

test('web navigation invalidates queued callbacks without releasing a still-active provider', async () => {
  const e = environment();
  let config;
  e.window.adBreak = (value) => { config = value; e.calls.web++; };
  let completed = 0;
  const pending = e.ads.showGameOverAd(() => { completed++; }, e.audio);
  e.ads.cancelPending();
  config.beforeAd();
  assert.equal(e.calls.pause, 0);
  e.advance(9 * 60_000);
  await e.ads.showGameOverAd(() => {}, e.audio);
  assert.equal(e.calls.web, 1);
  config.afterAd();
  config.adBreakDone();
  await pending;
  assert.equal(completed, 0);
});

test('web provider exceptions and absence never block game completion', async () => {
  const e = environment();
  let completed = 0;
  await e.ads.showGameOverAd(() => { completed++; }, e.audio);
  e.advance(30_000);
  e.window.adBreak = () => { throw new Error('SDK unavailable'); };
  await e.ads.showGameOverAd(() => { completed++; }, e.audio);
  assert.equal(completed, 2);
  assert.equal(e.calls.prepare, 0);
});

test('Cordova uses manual presentation after loading, cancellation never auto-shows', async () => {
  const e = environment();
  let loaded;
  let options;
  e.window.plugins = { AdMob: {
    prepareInterstitial(value, callback) { options = value; loaded = callback; e.calls.prepare++; },
    showInterstitial() { e.calls.show++; },
  } };
  await e.ads.showGameOverAd(() => {}, e.audio);
  const pending = e.ads.showGameOverAd(() => {}, e.audio);
  assert.equal(options.autoShow, false);
  e.ads.cancelPending();
  loaded();
  await pending;
  assert.equal(e.calls.show, 0);
  e.advance(30_000);
  const next = e.ads.showGameOverAd(() => {}, e.audio);
  loaded();
  await tick();
  assert.equal(e.calls.show, 1);
  const bannerDismissed = new Event('onAdDismiss');
  bannerDismissed.adType = 'banner';
  let settled = false;
  next.then(() => { settled = true; });
  e.document.dispatchEvent(bannerDismissed);
  await tick();
  assert.equal(settled, false, 'banner events cannot unlock an interstitial');
  e.document.dispatchEvent(new Event('onAdDismiss'));
  await next;
});
