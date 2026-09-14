import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { consumeGameRun, createGameRun } from "./leaderboard-db.ts";

const RUN_TTL_MS = 2 * 60 * 60 * 1000;

type RunPayload = {
  id: string;
  issuedAt: number;
  seed: number;
};

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is required to issue game proofs");
  return value;
}

function signature(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function issueRunProof(now = Date.now()): { proof: string; seed: number } {
  const seed = randomBytes(4).readUInt32LE(0) || 1;
  const run: RunPayload = { id: randomBytes(18).toString("base64url"), issuedAt: now, seed };
  createGameRun(run.id, now);
  const payload = Buffer.from(JSON.stringify(run)).toString("base64url");
  return { proof: `${payload}.${signature(payload)}`, seed };
}

export function verifyAndConsumeRunProof(proof: string, now = Date.now()): RunPayload | null {
  const [payload, suppliedSignature, extra] = proof.split(".");
  if (!payload || !suppliedSignature || extra) return null;

  const expected = Buffer.from(signature(payload));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;

  try {
    const run = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<RunPayload>;
    if (typeof run.id !== "string" || typeof run.issuedAt !== "number" || typeof run.seed !== "number") return null;
    if (run.issuedAt > now || now - run.issuedAt > RUN_TTL_MS) return null;
    return consumeGameRun(run.id, now) ? run as RunPayload : null;
  } catch {
    return null;
  }
}