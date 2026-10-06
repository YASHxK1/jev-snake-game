# Codebase Guide (file-by-file)

```text
index.html              shell: canvas #board, overlays, Jev/Laya mode buttons, settings inputs,
                        debug + stats panels
src/main.ts             entry: imports styles, starts App
src/styles.css          dark theme, layout, panels, toast
src/config.ts           Settings + DEFAULT_SETTINGS, localStorage load/save,
                        HIGHSCORE_KEY/SETTINGS_KEY, JEV_USD_PER_INPUT_TOKEN
src/core/types.ts       Direction, Vec, GameState, GamePhase, ControllerKind, DELTA, opposite()
src/core/rng.ts         mulberry32 seeded RNG (determinism for tests/sim)
src/core/game.ts        createGame, step(state, dir, rng), spawnFood/freeCells,
                        predictNext (pure lookahead for AI)
src/core/safety.ts      legalMoves (wall+body+reversal filter; tail-vacate aware),
                        isLethalOrReversal, foodDistance, headCrowded
src/core/encoder.ts     encodeState → EncodedState (grid/head/dir/body/food/legal/ASCII board)
src/controllers/controller.ts   Controller interface: decide(state): Promise<Direction>
src/controllers/bot.ts          bfsPath, freeSpaceAfter (flood fill), botChoose (pure fallback for Jev)
src/controllers/jev.ts          JevController (gateway-AI driver for jev AND laya):
                                every-N-ticks throttle, in-flight guard, predict-ahead,
                                gateDecision() (pure, tested), trap-P strategy, JevDebug stats
src/render/renderer.ts  Canvas 2D board (DPR-aware resize, roundRect w/ fallback)
src/net/client.ts       postDecide(body, timeoutMs): null on timeout/offline; never logs bodies
src/ui/app.ts           App: phases, rAF loop, keyboard (pause/start only), settings binding,
                        Jev/Laya mode wiring, stats attribution, resize, auto-pause
src/ui/panels.ts        renderDebug (model/choice/probs/conf/latency/calls/fallbacks/cost),
                        renderStats (Jev-vs-Laya table), StatsMap
src/ui/toast.ts         friendly toasts only (tech detail → debug panel/console)
api/decide.ts           the proxy (see ai-models.md). Origin check, 40/min IP limit,
                        16 KB cap, timeout + 2 retries w/ backoff, fail-soft JSON
tests/                  game, encoder, safety, bot, gating, decide.api (mocked `ai`),
                        simulate.bot (headless N-game averages, prints table)
scripts/simulate.ts     runHeadless() + `tsx` CLI: bot vs noisy stub (80/20)
scripts/simulate-live.ts opt-in REAL gateway comparison (skips without creds; CI-safe)
```

## Common changes — where to go

| Task | Touch |
|---|---|
| New AI model | `api/decide.ts` MODELS map + `ModelKey`, `.env.example`, `AiModel` in `net/client.ts`, mode button in `index.html`/`app.ts`, probe its confidence namespace live first |
| New question (e.g. `score` risk rating) | `api/decide.ts` questions + response fields, `DecideResponse` in `net/client.ts`, `JevDebug` + `applyResponse()` in `controllers/jev.ts`, debug panel in `panels.ts` |
| Tweak AI behavior | thresholds/throttle in `JevOptions` + `gateDecision()`; trap-P cutoff (0.7) in `applyResponse()` |
| Change rules (wrap walls, obstacles) | `core/game.ts` step + `core/safety.ts` legalMoves + `core/encoder.ts` board — keep all three consistent; Bot `freeSpaceAfter` inherits automatically |
| New controller | implement `Controller`, wire into `App.controller` getter + Jev/Laya mode buttons + `StatsMap` |
| Rate-limit hardening | `api/decide.ts` `hits` map is single-region in-memory → swap for Upstash Redis |

## Invariants to preserve

1. `core/` stays DOM-free and deterministic (RNG passed in, never `Math.random` inside).
2. The loop never awaits the network on the critical path (AI uses cached direction).
3. Client never sees keys; request bodies stay ≤ 16 KB; error bodies never logged.
4. Every AI answer is gated (`gateDecision`) — no raw model output steers the snake.
5. `experimental_evaluate` shapes verified against `ai@7.0.127` — re-verify on upgrade (see ai-models.md).
