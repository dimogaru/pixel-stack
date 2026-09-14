import { bigint, index, integer, pgTable, text } from "drizzle-orm/pg-core";

export const rateLimitsTable = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    requestCount: integer("request_count").notNull(),
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  },
  (table) => [index("rate_limits_expiration").on(table.expiresAt)],
);