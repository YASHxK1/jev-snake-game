# Architecture

## Layers (dependencies flow one way)

```text
core/          pure game logic, zero DOM/imports from other layers
  ↓
controllers/   Jev (gateway AI; BFS-bot pure functions as fallback) — behind `Controller`
  ↓
render/        Canvas 2D drawing only, no logic
  ↓
ui/            App shell (loop, phases, input), panels, toast
  ↓
net/           fetch client for /api/decide (timeout, size cap)

api/decide.ts  serverless proxy: validate → experimental_evaluate → tiny JSON
```

`core/` is deterministic (seeded `mulberry32` RNG injected into `step()`), so games are reproducible and unit-testable.

## Game loop (`src/ui/app.ts`)

Fixed timestep with `requestAnimationFrame` + accumulator; render every frame, max **one tick per frame** (remainder accrues, clamped at 250 ms/frame so tab-switch jumps don't spiral):

- **AI-driven (jev/laya modes):** step with the last known `desiredDir`, and refresh it in the background via fire-and-forget `.then()`. The loop **never blocks on the network**, so rendering stays at 60 FPS regardless of gateway latency.

Snapshots (`{...state, body: copy, food: copy}`) are passed to controllers so async AI reads can't race mutations.

## Decision flow (AI modes)

```text
tick → JevController.decide()
  → throttle: only call every N ticks (default 3), reuse cached direction between calls
  → in-flight guard: max 1 pending request; concurrent ticks reuse current direction
  → predictNext(state, dir): ask about the state ONE tick ahead (gateway latency > tick)
  → POST /api/decide {state: EncodedState, model: 'jev'|'laya', useTrapCheck}
  → server asks model: `choice` move question + optional parallel `boolean` trap question
  → gateDecision(): confidence + selected-probability floors, illegal/unexpected → BFS bot
  → optional trap strategy: trapped P ≥ 0.7 → prefer bot's safe move
  → fallback counted + reason logged; first fallback shows friendly toast
```

## Key decisions and why

| Decision | Reason |
|---|---|
| Code enforces hard rules; AI does strategy | Matches TypeSafe guidance (classification ≠ authorization); guarantees no lethal AI move ever executes — server re-filters too |
| Predict-one-tick-ahead + cache + in-flight guard | Gateway round trips (tens–hundreds of ms) exceed the 150 ms tick; game must not stutter or spam requests |
| Dual floor: `confidence` AND selected-option probability | Per the official KB routing pattern; confidence = distribution peakedness, probability = P(this move is best) — different signals |
| Compact JSON state (~1–4 KB) | Keeps input-token cost near zero ($0.000015 for a 360-token Jev call, $0 while Laya is free) and far under both contexts (Jev 32K, Laya 8K) |
| Strict `model: 'jev'\|'laya'` allowlist in `api/decide.ts` | Callers can never aim the proxy at arbitrary/expensive models |
| Fail-soft everywhere (`ok:false` → bot) | AI is an enhancement, not a dependency; offline/timeout/401/429/5xx all degrade to the bot with a toast |
| Session stats keyed by driver model | `endGame()` attributes games to `jev` vs `laya` via the active mode button, giving a Jev-vs-Laya table |
