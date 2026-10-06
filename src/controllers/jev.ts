import type { Direction, GameState } from '../core/types.ts';
import { predictNext } from '../core/game.ts';
import { isLethalOrReversal } from '../core/safety.ts';
import { encodeState } from '../core/encoder.ts';
import { botChoose } from './bot.ts';
import type { Controller } from './controller.ts';
import { postDecide, type AiModel, type DecideResponse } from '../net/client.ts';

export interface JevDebug {
  model: AiModel;
  lastStateJson: string;
  choice: Direction | null;
  probabilities: Record<string, number> | null;
  confidence: number | null;
  trapped: number | null;
  latencyMs: number | null;
  calls: number;
  fallbacks: number;
  lastFallbackReason: string;
  lastError: string;
  estCostUsd: number;
}

export interface JevOptions {
  confidenceThreshold: number;
  /** Which gateway evaluation model to ask: Jev (typesafe-ai) or Laya (boundless, free thru Oct 2026). */
  aiModel: AiModel;
  /** Ask the model every N ticks; ticks in between reuse the cached direction. */
  everyNTicks: number;
  /** Per-request timeout in ms. */
  timeoutMs: number;
  /** Include the speculative `trapped` boolean question (greedy vs safe strategy). */
  useTrapCheck: boolean;
  onDebug?: (d: JevDebug) => void;
}

const DEFAULTS: JevOptions = {
  confidenceThreshold: 0.6,
  aiModel: 'jev',
  everyNTicks: 3,
  timeoutMs: 1200,
  useTrapCheck: true,
};

function isDirection(v: unknown): v is Direction {
  return v === 'UP' || v === 'DOWN' || v === 'LEFT' || v === 'RIGHT';
}

/**
 * Confidence gating (pure, unit-tested): below either floor, or an illegal /
 * unexpected option, we fall back to the BFS bot and log the reason.
 * Mirrors the KB guide pattern (confidence floor + selected-probability floor).
 */
export function gateDecision(
  choice: unknown,
  probabilities: Record<string, number> | null | undefined,
  confidence: number | null | undefined,
  threshold: number,
  state: GameState,
): { direction: Direction | null; reason: string } {
  if (!isDirection(choice)) return { direction: null, reason: `unexpected-option:${String(choice)}` };
  if (isLethalOrReversal(state, choice)) return { direction: null, reason: `illegal-move:${choice}` };
  const selectedProb = probabilities?.[choice];
  if (confidence == null) return { direction: null, reason: 'missing-confidence' };
  if (confidence < threshold) return { direction: null, reason: `low-confidence:${confidence.toFixed(2)}` };
  if (selectedProb == null) return { direction: null, reason: 'missing-probability' };
  if (selectedProb < threshold) return { direction: null, reason: `low-probability:${selectedProb.toFixed(2)}` };
  return { direction: choice, reason: '' };
}

export class JevController implements Controller {
  readonly name = 'jev';
  private opts: JevOptions;
  private inFlight: Promise<DecideResponse | null> | null = null;
  private cached: Direction | null = null;
  private tickCount = 0;
  private lastIssuedAt = 0;
  debug: JevDebug = {
    model: 'jev',
    lastStateJson: '',
    choice: null,
    probabilities: null,
    confidence: null,
    trapped: null,
    latencyMs: null,
    calls: 0,
    fallbacks: 0,
    lastFallbackReason: 'none yet',
    lastError: '',
    estCostUsd: 0,
  };

  constructor(opts: Partial<JevOptions> = {}) {
    this.opts = { ...DEFAULTS, ...opts };
    this.debug.model = this.opts.aiModel;
  }

  get model(): AiModel {
    return this.opts.aiModel;
  }

  setModel(m: AiModel): void {
    this.opts.aiModel = m;
    this.debug.model = m;
    this.cached = null; // don't reuse the other model's cached direction
    this.emit();
  }

  setOptions(patch: Partial<JevOptions>): void {
    this.opts = { ...this.opts, ...patch };
  }

  reset(): void {
    this.inFlight = null;
    this.cached = null;
    this.tickCount = 0;
  }

  private emit(): void {
    this.opts.onDebug?.({ ...this.debug });
  }

  private fallback(state: GameState, reason: string): Direction {
    this.debug.fallbacks += 1;
    this.debug.lastFallbackReason = reason;
    this.emit();
    return botChoose(state);
  }

  async decide(state: GameState): Promise<Direction> {
    this.tickCount += 1;
    // Reuse cached direction between Jev calls.
    if (this.cached && this.tickCount % this.opts.everyNTicks !== 0) {
      if (!isLethalOrReversal(state, this.cached)) return this.cached;
      return this.fallback(state, `stale-cache-illegal:${this.cached}`);
    }
    // In-flight guard: only one request pending; reuse current direction meanwhile.
    if (this.inFlight) {
      try {
        const res = await this.inFlight;
        if (res) return this.applyResponse(state, res);
      } catch {
        /* fall through to fallback below */
      }
      return this.fallback(state, 'inflight-error');
    }
    // Predict one tick ahead (model latency can exceed a tick) and ask the server.
    const predicted = predictNext(state, this.cached ?? state.dir);
    const payload = {
      state: encodeState(predicted.alive ? predicted : state),
      model: this.opts.aiModel,
      useTrapCheck: this.opts.useTrapCheck,
    };
    this.debug.lastStateJson = JSON.stringify(payload.state);
    this.debug.calls += 1;

    const started = performance.now();
    const req = postDecide(payload, this.opts.timeoutMs);
    this.inFlight = req;
    try {
      const res = await req;
      const latency = performance.now() - started;
      if (!res) return this.fallback(state, 'timeout-or-offline');
      this.debug.latencyMs = Math.round(latency);
      return this.applyResponse(state, res);
    } catch (e) {
      this.debug.lastError = e instanceof Error ? e.message : String(e);
      return this.fallback(state, `request-error:${this.debug.lastError.slice(0, 60)}`);
    } finally {
      if (this.inFlight === req) this.inFlight = null;
      this.lastIssuedAt = performance.now();
      void this.lastIssuedAt;
    }
  }

  private applyResponse(state: GameState, res: DecideResponse): Direction {
    this.debug.choice = isDirection(res.direction) ? res.direction : null;
    this.debug.probabilities = res.probabilities;
    this.debug.confidence = res.confidence;
    this.debug.trapped = res.trapped ?? null;
    if (typeof res.estCostUsd === 'number') this.debug.estCostUsd += res.estCostUsd;
    if (!res.ok) {
      this.debug.lastError = res.error ?? 'server-error';
      return this.fallback(state, `server:${this.debug.lastError.slice(0, 60)}`);
    }
    const gated = gateDecision(
      res.direction,
      res.probabilities,
      res.confidence,
      this.opts.confidenceThreshold,
      state,
    );
    if (!gated.direction) return this.fallback(state, gated.reason);
    // Optional trap strategy: if the speculative boolean says trapped, prefer the bot's safe move.
    if (this.opts.useTrapCheck && res.trapped != null && res.trapped >= 0.7) {
      const safe = botChoose(state);
      if (safe !== gated.direction) {
        this.debug.fallbacks += 1;
        this.debug.lastFallbackReason = `trap-risk:${res.trapped.toFixed(2)}→bot:${safe}`;
        this.cached = safe;
        this.emit();
        return safe;
      }
    }
    this.cached = gated.direction;
    this.emit();
    return gated.direction;
  }
}
