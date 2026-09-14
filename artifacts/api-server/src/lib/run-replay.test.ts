import assert from "node:assert/strict";
import test from "node:test";
import { applyScoring, replayRun, type RunAction } from "./run-replay.ts";

const validFirstAnchor: RunAction = {
  kind: "anchor",
  pieceIndex: 0,
  rotation: 0,
  col: 0,
  row: 0,
  atMs: 500,
};

test("derives score from a mechanically valid seeded placement", () => {
  assert.equal(replayRun(1, [validFirstAnchor], 85_100, 86_100), 40);
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

test("matches the client level transition at each 1000 score points", () => {
  assert.deepEqual(applyScoring(960, 1, 0), { score: 1000, level: 2 });
  assert.deepEqual(applyScoring(1000, 2, 1), { score: 2080, level: 3 });
});