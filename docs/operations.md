# Operations (run / test / deploy / troubleshoot)

## Local development

```bash
npm install
npm run dev          # UI only — /api/decide 404s, AI modes fall back to bot (expected)
vercel link && vercel env pull   # OIDC token for gateway auth (expires ~12h)
vercel dev           # UI + /api/decide (real Jev/Laya calls)
```

Controls: Space/P pause · Enter start/restart · Jev/Laya buttons switch the driving model.

## Env vars (server-only; never `VITE_`-prefixed, never commit secrets)

| Var | Default | Notes |
|---|---|---|
| `AI_GATEWAY_API_KEY` | — | local fallback when OIDC absent |
| `JEV_MODEL` | `typesafe-ai/jev` | |
| `JEV_ONLY_PROVIDER` | `typesafe-ai` | alt: `digitalocean` |
| `LAYA_MODEL` | `convaiinnovations/laya` | free via Boundless thru Oct 31 2026 |
| `LAYA_ONLY_PROVIDER` | `boundless` | sole provider |
| `GATEWAY_ZDR` | `false` | set `true` only on Pro/Enterprise (Hobby 403s) |

`.env.example` is the committed template (empty key). Real keys go in local `.env` (gitignored) or Vercel project settings.

## Test & simulate

```bash
npx tsc --noEmit        # strict typecheck (includes api/, tests/, scripts/)
npx vitest run          # tests: rules, encoder, safety, bot, gating, mocked /api/decide, headless sim
npm run simulate        # tsx scripts/simulate.ts — bot vs noisy stub averages (no network, $0)
npx tsx scripts/simulate-live.ts 3   # REAL gateway calls; skips without creds
```

Integration tests mock `ai` (`vi.mock('ai')` → `experimental_evaluate`): success, illegal-choice filter, unexpected option, gateway-error retries (asserts 3 attempts), 400/405s, laya routing, inline-confidence fallback.

## Deploy (Vercel)

1. `vercel --prod` (static `dist/` + `api/decide.ts`, `maxDuration: 10` in `vercel.json`).
2. Auth: enable OIDC **or** set `AI_GATEWAY_API_KEY`; optional model/ZDR overrides above.
3. Set a Gateway **budget/spend limit**; monitor in AI Gateway → Logs / Custom Reporting / Budgets.

## Troubleshooting

| Symptom | Cause → fix |
|---|---|
| "Jev/Laya unreachable, using fallback bot" toast | no `/api/decide` (`npm run dev`), offline, timeout, or gateway error — detail in debug panel + console |
| 401 from gateway | expired local OIDC → `vercel env pull` (12h lifetime); check project link |
| 403 `ZdrUnauthorizedError` | Hobby plan + `GATEWAY_ZDR=true` → set `false` or upgrade |
| `fallback: missing-confidence` every call | provider stopped sending confidence → gate falls back to probability-only (code already reads selected-prob; consider lowering threshold) |
| 429 `rate-limited` | >40 req/min per IP (in-memory, single region) |
| AI drives into walls | impossible by construction — `legalMoves` + server filter; if seen, encoder and safety disagree → check `last state sent` in debug panel |
| Tests fail after `ai` upgrade | re-verify `choice`/`boolean` schemas + `providerMetadata.typesafe.confidence` against new types/docs (see ai-models.md) |
