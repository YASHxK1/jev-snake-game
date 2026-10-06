import { describe, expect, it } from 'vitest';
import { isLethalOrReversal, legalMoves } from '../src/core/safety.ts';
import { createGame } from '../src/core/game.ts';

describe('legal-move filter', () => {
  it('excludes walls and reversals in the corner', () => {
    const s = createGame({ width: 20, height: 20, tickMs: 150, seed: 1 });
    s.body = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    s.dir = 'LEFT';
    s.food = { x: 10, y: 10 };
    const legal = legalMoves(s);
    expect(legal).toEqual(['DOWN']); // UP+LEFT are walls, RIGHT is reversal
    expect(isLethalOrReversal(s, 'UP')).toBe(true);
    expect(isLethalOrReversal(s, 'RIGHT')).toBe(true);
    expect(isLethalOrReversal(s, 'DOWN')).toBe(false);
  });

  it('excludes body cells but allows chasing a vacating tail', () => {
    const s = createGame({ width: 20, height: 20, tickMs: 150, seed: 1 });
    s.body = [
      { x: 5, y: 5 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
    ];
    s.dir = 'LEFT';
    s.food = { x: 0, y: 0 };
    // DOWN hits body[1] (not the tail); RIGHT is a reversal.
    expect(legalMoves(s).sort()).toEqual(['LEFT', 'UP']);
    // Tail-chase shape: RIGHT steps onto the vacating tail (6,5).
    s.body = [
      { x: 5, y: 5 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
      { x: 6, y: 5 },
    ];
    s.dir = 'UP';
    expect(legalMoves(s)).toContain('RIGHT');
  });
});
