import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { pool } from "@workspace/db";

export type HighScore = {
  id: number;
  name: string;
  score: number;
  created_at: string;
};

const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databasePath = path.resolve(artifactDir, "data", "pixel-stack.sqlite");

mkdirSync(path.dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);
database.exec("PRAGMA journal_mode = WAL");
database.exec("PRAGMA busy_timeout = 5000");
database.exec(`
  CREATE TABLE IF NOT EXISTS game_runs (
    id TEXT PRIMARY KEY,
    issued_at INTEGER NOT NULL,
    consumed_at INTEGER
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

export async function listHighScores(): Promise<HighScore[]> {
  const result = await pool.query<HighScore>(`
    SELECT id, name, score, created_at::text AS created_at
    FROM high_scores
    ORDER BY score DESC, created_at ASC, id ASC
    LIMIT 20
  `);
  return result.rows;
}

export async function insertHighScore(name: string, score: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [73120420]);
    await client.query(
      "INSERT INTO high_scores (name, score) VALUES ($1, $2)",
      [name, score],
    );
    await client.query(`
      DELETE FROM high_scores
      WHERE id NOT IN (
        SELECT id
        FROM high_scores
        ORDER BY score DESC, created_at ASC, id ASC
        LIMIT 20
      )
    `);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function createGameRun(id: string, issuedAt: number): void {
  insertRunStatement.run(id, issuedAt);
  pruneRunsStatement.run(issuedAt - 24 * 60 * 60 * 1000);
}

export function consumeGameRun(id: string, consumedAt: number): boolean {
  return consumeRunStatement.run(consumedAt, id).changes === 1;
}

export async function isRateLimited(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<boolean> {
  const result = await pool.query<{ request_count: number }>(`
    WITH updated AS (
      INSERT INTO rate_limits (key, request_count, expires_at)
      VALUES ($1, 1, $2)
      ON CONFLICT(key) DO UPDATE SET
        request_count = CASE
          WHEN rate_limits.expires_at <= $3 THEN 1
          ELSE rate_limits.request_count + 1
        END,
        expires_at = CASE
          WHEN rate_limits.expires_at <= $3 THEN EXCLUDED.expires_at
          ELSE rate_limits.expires_at
        END
      RETURNING request_count
    ),
    cleaned AS (
      DELETE FROM rate_limits
      WHERE expires_at <= $3 AND key <> $1
    )
    SELECT request_count FROM updated
  `, [key, now + windowMs, now]);
  return result.rows[0].request_count > limit;
}