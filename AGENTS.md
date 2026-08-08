# AGENTS.md — run commands for this project

## Setup
Node 20+ (this repo needs PATH includes node; otherwise prefix with the nodejs bin dir).

## Commands
- **Dev:** `npm run dev` — starts Vite dev server (http://localhost:5173).
- **Type-check:** `npm run typecheck` — `tsc --noEmit`.
- **Lint:** `npm run lint` (or `npm run lint:fix` to autofix).
- **Build:** `npm run build` — typecheck + production Vite build into `dist/`.

## Conventions
- TypeScript, strict-ish Vite/TS template (`verbatimModuleSyntax: true`, `noUnusedLocals: true`).
- Type-only imports use `import type`.
- Tailwind CSS v4 (config lives in `src/index.css` via `@config`).
- Game data lives in `src/data/gameData.json`, typed via `src/data/types.ts` and accessed through `src/data/index.ts`.
- State lives in `src/stores/plannerStore.ts` (Zustand).
- Calculation engine: `src/utils/calculateTree.ts`.
