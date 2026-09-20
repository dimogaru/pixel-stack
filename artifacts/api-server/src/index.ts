import path from "path";
import express, { Request, Response, NextFunction } from "express";
import { app } from "./app";
import { logger } from "./logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Servir archivos estáticos del frontend
const clientDistPath = path.resolve(process.cwd(), "artifacts/pixel-stack/dist");
app.use(express.static(clientDistPath));

// Fallback de SPA con tipos explícitos para TypeScript
app.get("*", (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith("/api")) {
    return next();
  }
  res.sendFile(path.join(clientDistPath, "index.html"));
});

app.listen(port, () => {
  logger.info({ port }, "Server listening");
});
