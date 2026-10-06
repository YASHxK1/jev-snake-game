# AI Models (Jev + Laya via Vercel AI Gateway)

All shapes below were verified against the live docs AND the installed `ai@7.0.127` types (`node_modules/ai`, `node_modules/@ai-sdk/provider`), plus live `/v1/evaluate` probes on 2026-10-03. Do not rely on memory — re-check if you bump `ai`.

## The two models

| | Jev | Laya |
|---|---|---|
| Model ID | `typesafe-ai/jev` | `convaiinnovations/laya` |
| Maker | TypeSafe AI (System One) | Convai Innovations (System One) |
| Gateway provider (`only`) | `typesafe-ai` (alt: `digitalocean`) | `boundless` |
| Context | 32,768 | 8,192 |
| Billing | $0.042 / 1M input tokens, input-only | **$0 while free via Boundless thru Oct 31, 2026** (then standard ID bills; `-free` alias stops) |
| Env overrides | `JEV_MODEL`, `JEV_ONLY_PROVIDER` | `LAYA_MODEL`, `LAYA_ONLY_PROVIDER` |

Both are `type: evaluation` models called identically through `experimental_evaluate` (AI SDK ≥ 7.0.105).

## Verified API shapes

```ts
import { experimental_evaluate as evaluate } from 'ai';

// CHOICE question (declared)
{ type: 'choice', instructions: string, criteria: Record<optionKey, description> }  // ≤255 options
// CHOICE answer (received)
{ type: 'choice', choice: string, probabilities?: Record<optionKey, number> }

// BOOLEAN question — note: AI SDK name is `boolean`, NOT `noul` (native TypeSafe name)
{ type: 'boolean', instructions: string, criteria?: { true?: string, false?: string } }
// BOOLEAN answer — `probability` is P(true), NOT confidence in the answer
{ type: 'boolean', probability: number }  // 0.98 ≈ yes, 0.02 ≈ no, 0.5 = unsure

// SCORE (unused by the game, same call pattern)
{ type: 'score', instructions, criteria: string[2..10] }  // ordered low→high
```

- `state` accepts `string | object | array` — we send a JSON object directly (see `EncodedState` in `src/core/encoder.ts`: grid, head, dir, full body, food, legal moves, ASCII board).
- All `questions` in one call share one state and are evaluated **in parallel** — the trap question costs ~no latency.
- Import the question type as `import type { Experimental_EvaluationQuestion } from 'ai'`.
- Type quirk: `state` must be plain JSON — the code JSON-round-trips it (`as { grid: string }`) to satisfy the SDK input type.

## Confidence (read defensively)

- Canonical location: `result.providerMetadata?.typesafe?.confidence[questionId]` — **live-confirmed for BOTH Jev and Laya** (same `typesafe` namespace despite different providers). Choice+Score only; **never present for boolean**.
- Laya additionally echoes `confidence` inline on the choice answer — `api/decide.ts` uses metadata first, inline as fallback, else `null` → client treats as `missing-confidence` → bot fallback.
- Scale 0 (flat distribution) → 1 (all mass on one option). Distinct from the selected option's probability — gate on **both** (threshold default 0.6; see `gateDecision()` in `src/controllers/jev.ts`).
- TypeSafe rounds to 2 decimals; distributions may sum to 0.99 — do NOT renormalize.

## Auth & gateway options

```ts
providerOptions: { gateway: { only: ['typesafe-ai'] } }   // or ['boundless'] for Laya
// + zeroDataRetention: true ONLY when GATEWAY_ZDR=true (Pro/Enterprise; Hobby gets 403)
```

- Plain-string model IDs route through AI Gateway automatically. Auth: `VERCEL_OIDC_TOKEN` (auto on Vercel, `vercel env pull` locally, expires ~12h → 401 means re-pull) or `AI_GATEWAY_API_KEY` fallback. Never expose keys to the browser.
- Gateway calls appear in Logs / Custom Reporting and count toward Budgets — set a spend limit so strangers can't burn credits.

## Our question set (`api/decide.ts`)

- `move` (choice, UP/DOWN/LEFT/RIGHT with per-option criteria): "approach food (*) while keeping escape room; current dir + legal list injected into instructions."
- `trapped` (boolean, behind `useTrapCheck` flag): "at risk of trapping itself?" — client switches to the bot's safe move when P ≥ 0.7 and it disagrees.
- Server hard-filters the answer (illegal/reversal/unexpected → first legal move + `fallbackUsed: true` + reason); response is tiny: `{ok, model, direction, probabilities, confidence, trapped, latencyMs, usage, estCostUsd, fallbackUsed, reason?}`.

## Live-probe log (2026-10-03, temporary curl, nothing committed)

1. Jev + ZDR on Hobby → **403** `ZdrUnauthorizedError` (auth itself was fine). → Made `GATEWAY_ZDR` opt-in, default off.
2. Jev without ZDR → `RIGHT` (correct), conf 1.0, 360 input tokens, **$0.00001512**.
3. Laya without ZDR → `RIGHT` (correct), conf 0.5648, 56 input tokens, **$0** (promo).
