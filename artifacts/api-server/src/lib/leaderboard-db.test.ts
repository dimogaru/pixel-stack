import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";

process.env.SQLITE_PATH = path.join(
  mkdtempSync(path.join(tmpdir(), "pixel-stack-rate-limit-")),
  "rate-limits.sqlite",
);

const { isRateLimited } = await import("./leaderboard-db.ts");

after(async () => {
  await pool.end();
});

test("shares a request count by origin and enforces the configured limit", async () => {
  const originA = `run:${randomUUID()}`;
  const originB = `run:${randomUUID()}`;
  assert.equal(await isRateLimited(originA, 2, 60_000, 1_000), false);
  assert.equal(await isRateLimited(originA, 2, 60_000, 2_000), false);
  assert.equal(await isRateLimited(originA, 2, 60_000, 3_000), true);
  assert.equal(await isRateLimited(originB, 2, 60_000, 3_000), false);
});

test("resets an origin only after its stored window expires", async () => {
  const origin = `score:${randomUUID()}`;
  assert.equal(await isRateLimited(origin, 1, 1_000, 10_000), false);
  assert.equal(await isRateLimited(origin, 1, 1_000, 10_999), true);
  assert.equal(await isRateLimited(origin, 1, 1_000, 11_000), false);
});