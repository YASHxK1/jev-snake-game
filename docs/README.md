# SnakeJev — AI Coder Reference

How this project works, written for a future AI coding agent (or human) picking it up cold.
Start here, then follow the links.

| Doc | Covers |
|---|---|
| [architecture.md](architecture.md) | Layers, game loop, data flow, key design decisions |
| [ai-models.md](ai-models.md) | Jev + Laya via Vercel AI Gateway: verified API shapes, env vars, gating, live-probe results |
| [codebase-guide.md](codebase-guide.md) | File-by-file map: what lives where, what to touch for common changes |
| [operations.md](operations.md) | Run / test / simulate / deploy, troubleshooting |

## 30-second orientation

- **What:** Classic Snake (Canvas 2D) playable by Human, AI (Jev or Laya via AI Gateway), BFS Bot, or Hybrid takeover.
- **Stack:** Vite + strict TypeScript + Vitest (frontend, `src/`), one Vercel serverless function (`api/decide.ts`, Node 22) using `ai@7.0.127` (`experimental_evaluate`, needs ≥ 7.0.105) + `@ai-sdk/gateway@4.0.103`.
- **Verified green:** `npx tsc --noEmit`, `npx vitest run` (33 tests), `npm run build`.
- **Golden rule:** hard safety rules live in code (lethal/180° filters, server + client); the AI model only supplies fuzzy strategy. Never expose gateway keys to the browser.
