import type { Direction, GameState } from '../core/types.ts';

/**
 * Every steering source implements this. The game loop never blocks on it:
 * it caches the latest resolved direction and keeps simulating at fixed ticks.
 */
export interface Controller {
  readonly name: string;
  decide(state: GameState): Promise<Direction>;
  /** Optional per-tick hook (used by Human queue + Hybrid idle timer). */
  onTick?(state: GameState): void;
  reset?(): void;
}
