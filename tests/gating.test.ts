import { describe, expect, it } from 'vitest';
import { gateDecision } from '../src/controllers/jev.ts';
import { createGame } from '../src/core/game.ts';

const probs = { UP: 0.1, DOWN: 0.1, LEFT: 0.05, RIGHT: 0.75 };

describe('confidence gating', () => {
  it('accepts a confident legal move', () => {
    const s = createGame({ width: 20, height: 20, tickMs: 150, seed: 1 });
    s.food = { x: 15, y: 10 };
    expect(gateDecision('RIGHT', probs, 0.8, 0.6, s).direction).toBe('RIGHT');
  });

  it('rejects low confidence', () => {
    const s = createGame({ width: 20, height: 20, tickMs: 150, seed: 1 });
    const r = gateDecision('RIGHT', probs, 0.4, 0.6, s);
    expect(r.direction).toBeNull();
    expect(r.reason).toMatch(/^low-confidence/);
  });

  it('rejects low selected-option probability', () => {
    const s = createGame({ width: 20, height: 20, tickMs: 150, seed: 1 });
    const r = gateDecision('RIGHT', { ...probs, RIGHT: 0.5 }, 0.9, 0.6, s);
    expect(r.direction).toBeNull();
    expect(r.reason).toMatch(/^low-probability/);
  });

  it('rejects illegal and reversing moves', () => {
    const s = createGame({ width: 20, height: 20, tickMs: 150, seed: 1 });
    expect(gateDecision('LEFT', probs, 0.99, 0.6, s).reason).toMatch(/^illegal-move/);
  });

  it('rejects unexpected options and missing confidence', () => {
    const s = createGame({ width: 20, height: 20, tickMs: 150, seed: 1 });
    expect(gateDecision('DIAGONAL', probs, 0.9, 0.6, s).reason).toMatch(/^unexpected-option/);
    expect(gateDecision('RIGHT', probs, null, 0.6, s).reason).toBe('missing-confidence');
    expect(gateDecision('RIGHT', null, 0.9, 0.6, s).reason).toBe('missing-probability');
  });
});
