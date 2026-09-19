import { Router, type IRouter, type Request } from "express";
import { ListScoresResponse, SubmitScoreBody, SubmitScoreResponse } from "@workspace/api-zod";
import { insertHighScore, isRateLimited, listHighScores } from "../lib/leaderboard-db";

const router: IRouter = Router();

function requestOrigin(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

function scoreAudit(score: number, level?: number, timePlayedSeconds?: number) {
  const expectedLevel = Math.floor(score / 500) + 1;
  const scorePerSecond = timePlayedSeconds && timePlayedSeconds > 0
    ? score / timePlayedSeconds
    : null;
  const scorePerLevel = level && level > 0 ? score / level : null;
  const reasons: string[] = [];

  if (level !== undefined && level !== expectedLevel) {
    reasons.push(`reported level ${level} does not match expected level ${expectedLevel}`);
  }
  if (
    timePlayedSeconds !== undefined
    && ((timePlayedSeconds < 10 && score >= 5_000)
      || (score >= 10_000 && scorePerSecond !== null && scorePerSecond > 5_000))
  ) {
    reasons.push("score is too high for the reported play time");
  }

  return {
    expectedLevel,
    scorePerSecond: scorePerSecond === null ? null : Number(scorePerSecond.toFixed(2)),
    scorePerLevel: scorePerLevel === null ? null : Number(scorePerLevel.toFixed(2)),
    reasons,
  };
}

router.get("/scores", async (req, res): Promise<void> => {
  try {
    res.json(ListScoresResponse.parse(await listHighScores()));
  } catch (error) {
    req.log.error({ err: error }, "Failed to load leaderboard");
    res.status(500).json({ error: "Could not load leaderboard" });
  }
});

router.post("/scores", async (req, res): Promise<void> => {
  if (await isRateLimited(`score:${requestOrigin(req)}`, 5, 60_000)) {
    res.status(429).json({ error: "Too many score submissions" });
    return;
  }
  const parsed = SubmitScoreBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ validation: parsed.error.issues }, "Invalid leaderboard submission");
    res.status(400).json({ error: "Name must be valid and score must be greater than zero" });
    return;
  }

  try {
    const name = parsed.data.name.trim().slice(0, 10).toUpperCase();
    await insertHighScore(name, parsed.data.score);
    const savedAt = new Date().toISOString();
    const origin = requestOrigin(req);
    const audit = scoreAudit(
      parsed.data.score,
      parsed.data.level,
      parsed.data.timePlayedSeconds,
    );
    const logContext = {
      savedAt,
      player: name,
      score: parsed.data.score,
      level: parsed.data.level ?? null,
      timePlayedSeconds: parsed.data.timePlayedSeconds ?? null,
      origin,
      expectedLevel: audit.expectedLevel,
      scorePerSecond: audit.scorePerSecond,
      scorePerLevel: audit.scorePerLevel,
    };

    req.log.info(logContext, "Leaderboard score saved");
    if (audit.reasons.length > 0) {
      req.log.warn(
        { ...logContext, anomalyReasons: audit.reasons },
        "Warning: Anomalous score detected",
      );
    }
    res.status(200).json(SubmitScoreResponse.parse({ success: true }));
  } catch (error) {
    req.log.error({ err: error }, "Failed to save leaderboard score");
    res.status(500).json({ error: "Could not save leaderboard score" });
  }
});

export default router;