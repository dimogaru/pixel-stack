import assert from "node:assert/strict";
import test from "node:test";
import { applyScoring, collapseSpeedForLava, lavaSpeedForLevel, levelForScore, meltGridAtLava, replayRun, resolveCompactClears, type RunAction } from "./run-replay.ts";

const validFirstAnchor: RunAction = {
  kind: "anchor",
  pieceIndex: 0,
  rotation: 0,
  col: 0,
  row: 0,
  atMs: 500,
};

test("derives score from a mechanically valid seeded placement", () => {
  assert.equal(replayRun(1, [validFirstAnchor], 93_300, 94_300), 25);
});

test("rejects skipped pieces used to cherry-pick the seeded sequence", () => {
  assert.equal(
    replayRun(1, [{ ...validFirstAnchor, pieceIndex: 8 }], 85_100, 86_100),
    null,
  );
});

test("rejects placements outside the board", () => {
  assert.equal(
    replayRun(1, [{ ...validFirstAnchor, col: 9 }], 85_100, 86_100),
    null,
  );
});

test("rejects actions faster than the game can complete pieces", () => {
  assert.equal(
    replayRun(
      1,
      [
        validFirstAnchor,
        { ...validFirstAnchor, pieceIndex: 1, col: 4, atMs: 600 },
      ],
      85_100,
      86_100,
    ),
    null,
  );
});

test("rejects fabricated losses instead of using them to skip seeded pieces", () => {
  const fabricatedLoss = {
    kind: "loss",
    pieceIndex: 0,
    atMs: 500,
  };
  assert.equal(
    replayRun(1, [fabricatedLoss as unknown as RunAction], 85_100, 86_100),
    null,
  );
});

test("rejects client timestamps beyond the signed run duration", () => {
  assert.equal(
    replayRun(1, [{ ...validFirstAnchor, atMs: 5_000 }], 80_000, 1_000),
    null,
  );
});

test("rejects a terminal claim before the lava reaches game over", () => {
  assert.equal(replayRun(1, [validFirstAnchor], 10_000, 11_000), null);
});

test("rejects geometrically valid actions after lava game over", () => {
  assert.equal(
    replayRun(
      1,
      [
        validFirstAnchor,
        { ...validFirstAnchor, pieceIndex: 1, col: 4, atMs: 1_000_000 },
      ],
      1_010_000,
      1_011_000,
    ),
    null,
  );
});

test("matches the client level transition at each 500 score points", () => {
  assert.equal(levelForScore(0), 1);
  assert.equal(levelForScore(499), 1);
  assert.equal(levelForScore(500), 2);
  assert.equal(levelForScore(999), 2);
  assert.equal(levelForScore(1_000), 3);
  assert.equal(levelForScore(1_999), 4);
  assert.deepEqual(applyScoring(490, false, 0), { score: 500, level: 2 });
  assert.deepEqual(applyScoring(500, true, 1), { score: 625, level: 2 });
});

test("raises lava speed gradually by 6 percent per level and enforces its cap", () => {
  assert.equal(lavaSpeedForLevel(1), 0.0055);
  assert.ok(Math.abs(lavaSpeedForLevel(2) / lavaSpeedForLevel(1) - 1.06) < 1e-10);
  assert.ok(Math.abs(lavaSpeedForLevel(10) / lavaSpeedForLevel(9) - 1.06) < 1e-10);
  assert.equal(lavaSpeedForLevel(100), 0.013);
  assert.ok(lavaSpeedForLevel(100) < 0.014);
});

test("accelerates collapse enough to reach the ceiling within 1.2 seconds", () => {
  const speed = collapseSpeedForLava(638, 1);
  assert.ok(speed >= lavaSpeedForLevel(1) * 10);
  assert.ok((638 - 78) / speed <= 1_200);
});

test("awards fixed anchor and one-time line-clear points", () => {
  assert.deepEqual(applyScoring(0, false, 0), { score: 10, level: 1 });
  assert.deepEqual(applyScoring(0, true, 0), { score: 25, level: 1 });
  assert.deepEqual(applyScoring(0, false, 1), { score: 110, level: 1 });
  assert.deepEqual(applyScoring(0, false, 2), { score: 360, level: 1 });
  assert.deepEqual(applyScoring(0, false, 3), { score: 860, level: 2 });
});

test("compacts lower rows toward the ceiling and resolves chained clears", () => {
  const empty = () => Array<boolean>(10).fill(false);
  const grid = Array.from({ length: 18 }, empty);
  grid[2] = Array<boolean>(10).fill(true);
  grid[3] = Array<boolean>(10).fill(true);
  grid[4][0] = true;

  assert.deepEqual(resolveCompactClears(grid, 1, 1), {
    clearedRows: 2,
    combo: 2,
    scoreBonus: 350,
  });
  assert.equal(grid[2][0], true);
  assert.equal(grid[2].filter(Boolean).length, 1);
  assert.equal(grid[17].some(Boolean), false);
});

test("melts anchored blocks progressively from the lava surface upward", () => {
  const grid = Array.from({ length: 18 }, () => Array<boolean>(10).fill(false));
  grid[10][0] = true;
  grid[11][1] = true;
  grid[12][2] = true;

  assert.equal(meltGridAtLava(grid, 76 + 12 * 36), 2);
  assert.equal(grid[10][0], true);
  assert.equal(grid[11][1], false);
  assert.equal(grid[12][2], false);
  assert.equal(meltGridAtLava(grid, 76 + 11 * 36), 1);
  assert.equal(grid.flat().some(Boolean), false);
});