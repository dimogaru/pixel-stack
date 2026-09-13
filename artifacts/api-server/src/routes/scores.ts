import { Router, type IRouter } from "express";
import { ListScoresResponse, SubmitScoreBody, SubmitScoreResponse } from "@workspace/api-zod";
import { insertHighScore, listHighScores } from "../lib/leaderboard-db";

const router: IRouter = Router();

router.get("/scores", (_req, res): void => {
  res.json(ListScoresResponse.parse(listHighScores()));
});

router.post("/scores", (req, res): void => {
  const parsed = SubmitScoreBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ validation: parsed.error.issues }, "Invalid leaderboard submission");
    res.status(400).json({ error: "Nickname or score is invalid" });
    return;
  }

  const nickname = parsed.data.nickname.trim().toUpperCase();
  const inserted = insertHighScore(nickname, parsed.data.score);
  if (!inserted) {
    res.status(409).json({ error: "Score did not qualify for the Top 10" });
    return;
  }

  res.status(201).json(SubmitScoreResponse.parse(inserted));
});

export default router;