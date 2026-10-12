const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the real React handler bodies without React, a browser, or live ads.
function handlers() {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/App.tsx'), 'utf8');
  const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const home = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'Home');
  const expressions = {};
  function visit(node) {
    if (ts.isPropertyAssignment(node) && ['onGameOver', 'onRunStart'].includes(node.name.getText(ast))) {
      expressions[node.name.getText(ast)] = node.initializer.getText(ast);
    }
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'restart') {
      expressions.restart = node.initializer.getText(ast);
    }
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') {
      const effect = node.arguments[0].getText(ast);
      if (effect.includes('gamePlatform.initialize()')) expressions.mount = effect;
      if (effect.includes('leaderboardOpen || helpOpen')) expressions.openScreen = effect;
    }
    ts.forEachChild(node, visit);
  }
  visit(home);
  assert.deepEqual(Object.keys(expressions).sort(), ['mount', 'onGameOver', 'onRunStart', 'openScreen', 'restart']);
  const counts = { ads: 0, cancel: 0, stop: 0 };
  const window = new EventTarget();
  const document = new EventTarget();
  const context = {
    window, document, exports: {},
    handledGameOverRef: { current: false },
    soundOnRef: { current: true },
    leaderboardOpen: false, helpOpen: false,
    t: (key) => key, createLocalRunSeed: () => 1,
    checkQualification() {},
    gamePlatform: { initialize() {}, runStarted() {}, runStopped() { counts.stop++; }, isCrazyGames: false },
    adsenseGameAds: { showGameOverAd() { counts.ads++; }, cancelPending() { counts.cancel++; } },
  };
  for (const name of [
    'Score', 'Level', 'Combo', 'Paused', 'GameState', 'Message', 'QualifyingScore',
    'QualifyingRun', 'SubmitStatus', 'SubmitMessage', 'LastSubmittedScore', 'Nickname',
    'RunSeed', 'RunKey',
  ]) context[`set${name}`] = () => {};
  const compiled = ts.transpileModule(
    Object.entries(expressions).map(([name, value]) => `exports.${name} = ${value};`).join('\n'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  vm.runInNewContext(compiled, context);
  return { ...context.exports, context, counts };
}

test('one ad per game-over event; restart rejects late events until the new run starts', () => {
  const h = handlers();
  h.onRunStart();
  h.onGameOver(0, 1);
  h.onGameOver(0, 1);
  assert.equal(h.counts.ads, 1);
  assert.equal(h.counts.stop, 1);
  h.restart();
  h.onGameOver(0, 1);
  assert.equal(h.counts.ads, 1, 'old scene cannot request an ad after restart');
  assert.equal(h.counts.cancel, 1);
  h.onRunStart();
  h.onGameOver(0, 2);
  assert.equal(h.counts.ads, 2, 'next run gets one new opportunity');
});

test('pagehide, backgrounding, screen changes and unmount cancel pending ads and remove listeners', () => {
  const h = handlers();
  const cleanup = h.mount();
  h.context.window.dispatchEvent(new Event('pagehide'));
  h.context.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(h.counts.cancel, 1);
  h.context.document.hidden = true;
  h.context.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(h.counts.cancel, 2);
  h.context.helpOpen = true;
  h.openScreen();
  h.context.helpOpen = false;
  h.context.leaderboardOpen = true;
  h.openScreen();
  assert.equal(h.counts.cancel, 4);
  cleanup();
  assert.equal(h.counts.cancel, 5);
  h.context.window.dispatchEvent(new Event('pagehide'));
  h.context.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(h.counts.cancel, 5, 'unmount removed both DOM listeners');
});
