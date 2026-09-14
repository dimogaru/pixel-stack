import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

export type HighScore = {
  id: number;
  nickname: string;
  score: number;
  created_at: string;
};

const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databasePath = process.env.SQLITE_PATH ?? path.join(artifactDir, "data", "pixel-stack.sqlite");

mkdirSync(path.dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);
database.exec("PRAGMA journal_mode = WAL");
database.exec("PRAGMA busy_timeout = 5000");
database.exec(`
  CREATE TABLE IF NOT EXISTS high_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname TEXT NOT NULL CHECK(length(nickname) BETWEEN 1 AND 10),
    score INTEGER NOT NULL CHECK(score >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
database.exec(`
  CREATE INDEX IF NOT EXISTS high_scores_ranking
  ON high_scores(score DESC, created_at ASC, id ASC)
`);
database.exec(`
  CREATE TABLE IF NOT EXISTS game_runs (
    id TEXT PRIMARY KEY,
    issued_at INTEGER NOT NULL,
    consumed_at INTEGER
  )
`);

const listStatement = database.prepare(`
  SELECT id, nickname, score, created_at
  FROM high_scores
  ORDER BY score DESC, created_at ASC, id ASC
  LIMIT 10
`);

const countStatement = database.prepare("SELECT COUNT(*) AS count FROM high_scores");
const minimumStatement = database.prepare(`
  SELECT score
  FROM high_scores
  ORDER BY score DESC, created_at ASC, id ASC
  LIMIT 1 OFFSET 9
`);
const insertStatement = database.prepare(`
  INSERT INTO high_scores (nickname, score)
  VALUES (?, ?)
  RETURNING id, nickname, score, created_at
`);
const pruneStatement = database.prepare(`
  DELETE FROM high_scores
  WHERE id NOT IN (
    SELECT id
    FROM high_scores
    ORDER BY score DESC, created_at ASC, id ASC
    LIMIT 10
  )
`);
const insertRunStatement = database.prepare(`
  INSERT INTO game_runs (id, issued_at) VALUES (?, ?)
`);
const consumeRunStatement = database.prepare(`
  UPDATE game_runs
  SET consumed_at = ?
  WHERE id = ? AND consumed_at IS NULL
`);
const pruneRunsStatement = database.prepare(`
  DELETE FROM game_runs WHERE issued_at < ?
`);

export function listHighScores(): HighScore[] {
  return listStatement.all() as unknown as HighScore[];
}

export function getLeaderboardCutoff(): { count: number; minimum: number | null } {
  const { count } = countStatement.get() as { count: number };
  const minimumRow = minimumStatement.get() as { score: number } | undefined;
  return { count, minimum: minimumRow?.score ?? null };
}

export function insertHighScore(nickname: string, score: number): HighScore | null {
  database.exec("BEGIN IMMEDIATE");
  try {
    const cutoff = getLeaderboardCutoff();
    if (cutoff.count >= 10 && cutoff.minimum !== null && score <= cutoff.minimum) {
      database.exec("ROLLBACK");
      return null;
    }

    const inserted = insertStatement.get(nickname, score) as unknown as HighScore;
    pruneStatement.run();
    database.exec("COMMIT");
    return inserted;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function createGameRun(id: string, issuedAt: number): void {
  insertRunStatement.run(id, issuedAt);
  pruneRunsStatement.run(issuedAt - 24 * 60 * 60 * 1000);
}

export function consumeGameRun(id: string, consumedAt: number): boolean {
  return consumeRunStatement.run(consumedAt, id).changes === 1;
}