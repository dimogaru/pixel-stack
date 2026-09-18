import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const highScoresTable = pgTable(
  "high_scores",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    score: integer("score").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("high_scores_ranking").on(table.score, table.createdAt, table.id)],
);

export type HighScore = typeof highScoresTable.$inferSelect;