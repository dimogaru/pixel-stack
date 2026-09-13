# Pixel Stack

A mobile-first Phaser 3 arcade PWA where players drag neon pieces upward to build a descending tower before rising lava reaches the ceiling.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/pixel-stack run dev` — run the Pixel Stack web app through its managed workflow
- `pnpm --filter @workspace/pixel-stack run typecheck` — check the game frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/pixel-stack/src/App.tsx` — Phaser scene, game rules, and React HUD
- `artifacts/pixel-stack/src/index.css` — responsive neon visual system
- `artifacts/pixel-stack/public/manifest.json` — installable PWA metadata
- `artifacts/pixel-stack/public/sw.js` — offline application cache

## Architecture decisions

- The game is client-only for the prototype; the shared Express API remains available for future leaderboards or accounts.
- Phaser is loaded from jsDelivr and cached by the Service Worker so installed builds can continue offline.
- React owns the surrounding HUD and overlays while Phaser owns the real-time playfield and pointer interactions.

## Product

Players tap near the lava to spawn a piece, drag it upward, and release to lock it beneath the ceiling or existing tower. Lava rises continuously, briefly pauses on tower contact, and ends the run when it reaches the ceiling. The app tracks a local best score and supports pause, restart, replay, and PWA installation.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
