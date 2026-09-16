import { Router, type IRouter, type Request } from "express";
import { ListScoresResponse, SubmitScoreBody, SubmitScoreResponse } from "@workspace/api-zod";
import { insertHighScore, isRateLimited, listHighScores } from "../lib/leaderboard-db";

const router: IRouter = Router();

function requestOrigin(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

router.get("/scores", (req, res): void => {
  try {
    res.json(ListScoresResponse.parse(listHighScores()));
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
    insertHighScore(name, parsed.data.score);
    req.log.info({ name, score: parsed.data.score }, "Leaderboard score saved");
    res.status(200).json(SubmitScoreResponse.parse({ success: true }));
  } catch (error) {
    req.log.error({ err: error }, "Failed to save leaderboard score");
    res.status(500).json({ error: "Could not save leaderboard score" });
  }
});

export default router;