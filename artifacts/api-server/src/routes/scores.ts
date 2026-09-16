import { Router, type IRouter, type Request } from "express";
import { ListScoresResponse, StartRunResponse, SubmitScoreBody, SubmitScoreResponse } from "@workspace/api-zod";
import { insertHighScore, isRateLimited, listHighScores } from "../lib/leaderboard-db";
import { issueRunProof, verifyAndConsumeRunProof } from "../lib/run-proof";
import { replayRun } from "../lib/run-replay";

const router: IRouter = Router();

function requestOrigin(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

router.post("/runs", async (req, res): Promise<void> => {
  if (await isRateLimited(`run:${requestOrigin(req)}`, 10, 60_000)) {
    res.status(429).json({ error: "Too many game runs" });
    return;
  }
  res.status(201).json(StartRunResponse.parse(issueRunProof()));
});

router.get("/scores", (_req, res): void => {
  res.json(ListScoresResponse.parse(listHighScores()));
});

router.post("/scores", async (req, res): Promise<void> => {
  if (await isRateLimited(`score:${requestOrigin(req)}`, 5, 60_000)) {
    res.status(429).json({ error: "Too many score submissions" });
    return;
  }
  const parsed = SubmitScoreBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ validation: parsed.error.issues }, "Invalid leaderboard submission");
    res.status(400).json({ error: "Nickname or score is invalid" });
    return;
  }

  const run = verifyAndConsumeRunProof(parsed.data.proof);
  if (!run) {
    res.status(401).json({ error: "Run proof is invalid, expired, or already used" });
    return;
  }

  const elapsedMs = Date.now() - run.issuedAt;
  const recalculated = replayRun(run.seed, parsed.data.actions, parsed.data.endedAtMs, elapsedMs);
  if (recalculated === null || recalculated !== parsed.data.score) {
    req.log.warn({ submitted: parsed.data.score, recalculated }, "Leaderboard score mismatch");
    res.status(400).json({ error: "Score does not match a valid game replay" });
    return;
  }

  const nickname = parsed.data.nickname.trim().toUpperCase();
  const inserted = insertHighScore(nickname, parsed.data.score);
  if (!inserted) {
    res.status(409).json({ error: "Score did not qualify for the Top 20" });
    return;
  }

  res.status(201).json(SubmitScoreResponse.parse(inserted));
});

export default router;