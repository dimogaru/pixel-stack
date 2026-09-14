import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

process.env.SESSION_SECRET = "test-only-run-proof-secret";
process.env.SQLITE_PATH = path.join(
  mkdtempSync(path.join(tmpdir(), "pixel-stack-run-proof-")),
  "proofs.sqlite",
);

const { issueRunProof, verifyAndConsumeRunProof } = await import("./run-proof.ts");

test("accepts a signed run once and rejects replay", () => {
  const issued = issueRunProof(10_000);
  const verified = verifyAndConsumeRunProof(issued.proof, 11_000);
  assert.equal(verified?.seed, issued.seed);
  assert.equal(verifyAndConsumeRunProof(issued.proof, 11_100), null);
});

test("rejects altered proof signatures", () => {
  const issued = issueRunProof(20_000);
  const altered = `${issued.proof.slice(0, -1)}x`;
  assert.equal(verifyAndConsumeRunProof(altered, 21_000), null);
});

test("rejects expired runs", () => {
  const issued = issueRunProof(30_000);
  assert.equal(
    verifyAndConsumeRunProof(issued.proof, 30_000 + 2 * 60 * 60 * 1000 + 1),
    null,
  );
});