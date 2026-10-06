# SnakeJev 🐍

Classic Snake steered **AI-only** by **Vercel AI Gateway evaluation models** — **Jev** (TypeSafe AI, `typesafe-ai/jev`) or **Laya** (Convai Innovations, `convaiinnovations/laya`, free via Boundless through Oct 31, 2026). Vite + strict TypeScript + Canvas 2D, one Vercel serverless function. Pick the driver with the **Jev** / **Laya** buttons; an internal BFS bot acts only as automatic fallback.

Pinned versions: `ai@7.0.127` (`experimental_evaluate` needs ≥ 7.0.105), `@ai-sdk/gateway@4.0.103`, Node ≥ 22.

## How the AI steers the snake

`rAF loop → Controller.decide() → POST /api/decide {state, model} → experimental_evaluate() → AI Gateway → Jev/Laya → JSON {direction, probabilities, confidence} → confidence gate → loop`.

- One **`choice`** question (`UP/DOWN/LEFT/RIGHT` with per-option criteria) + optional speculative **`boolean`** trap-risk question in the same round trip (parallel, barely any extra latency).
- `state` is a compact JSON object (grid, head, dir, full body, food, ASCII board, **legal moves**) — far under either model's context (Jev 32K, Laya 8K), input-token-only billing (Jev $0.042/1M; Laya cost 0 while free).
- Code enforces hard rules (lethal/180° pre-filter, server + client); the model supplies fuzzy strategy. Low confidence, low selected-probability, missing confidence, illegal or unexpected options → BFS bot fallback with a logged reason.
- Gateway routing is per model: Jev `only: ['typesafe-ai']`, Laya `only: ['boundless']`. Auth: `VERCEL_OIDC_TOKEN` on Vercel / `vercel env pull` locally, `AI_GATEWAY_API_KEY` fallback. Key never reaches the browser.
- Zero data retention is **opt-in** (`GATEWAY_ZDR=true`) because it is Pro/Enterprise-only — Hobby plans get 403 with it on.

## Run

```bash
npm install
npm run dev          # UI only (Jev calls 404 → auto fallback bot)
vercel link && vercel env pull   # OIDC token for gateway auth
vercel dev           # UI + /api/decide (real Jev)
```

Open the printed URL. Space pauses, Enter starts/restarts. The Jev / Laya buttons switch the driving model mid-game.

## Test / simulate

```bash
npm test             # vitest: movement, collision, growth, spawn, encoder, safety, gating, mocked /api/decide
npx tsx scripts/simulate.ts 50 12   # headless: BFS bot vs noisy stub-Jev averages
npx tsx scripts/simulate-live.ts 3  # optional REAL gateway calls (needs key/OIDC; CI-safe skip)
```

## Deploy (Vercel)

1. `vercel link` + `vercel --prod` (static build + `api/decide.ts`, `maxDuration: 10`).
2. Auth: enable OIDC for AI Gateway in project settings **or** add `AI_GATEWAY_API_KEY` env var (never `VITE_`-prefixed). Optional overrides: `JEV_MODEL` (default `typesafe-ai/jev`), `JEV_ONLY_PROVIDER` (default `typesafe-ai`), `LAYA_MODEL` (default `convaiinnovations/laya`), `LAYA_ONLY_PROVIDER` (default `boundless`), `GATEWAY_ZDR` (default `false`; set `true` only on Pro/Enterprise).
3. Set a Gateway **budget/spend limit** so strangers can't burn credits; watch usage in AI Gateway **Logs → Custom Reporting → Budgets**.
4. Proxy protections are built in: origin check, 40 req/min per-IP limit, 16 KB body cap, no full error-body logging.

## Known limitations / roadmap

- Single player, no obstacles; cost estimate covers input tokens only.
- Next: obstacles, two-snake duel (Jev vs bot), `score`-type risk question, replay recorder, leaderboard, Upstash rate limiting for multi-region prod.
