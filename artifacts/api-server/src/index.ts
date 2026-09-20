import path from "path";
import express, { Request, Response, NextFunction } from "express";
import app from "./app";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// 1. Servir archivos estáticos del frontend pixel-stack
const clientDistPath = path.resolve(process.cwd(), "../pixel-stack/dist/public");
app.use(express.static(clientDistPath));

// 2. Redirección para Single Page Application (SPA)
// En Express 5 con path-to-regexp v8 se usa /{*splat} o /*splat
app.get("/{*splat}", (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith("/api")) {
    return next();
  }
  res.sendFile(path.join(clientDistPath, "index.html"));
});

// 3. Arrancar servidor
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
