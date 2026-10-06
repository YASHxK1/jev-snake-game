import { describe, expect, it } from 'vitest';
import { bfsPath, botChoose, freeSpaceAfter } from '../src/controllers/bot.ts';
import { legalMoves } from '../src/core/safety.ts';
import { createGame } from '../src/core/game.ts';

describe('BFS bot', () => {
  it('finds the straight-line path to food', () => {
    const s = createGame({ width: 20, height: 20, tickMs: 150, seed: 1 });
    s.food = { x: 13, y: 10 };
    expect(bfsPath(s)).toEqual(['RIGHT', 'RIGHT', 'RIGHT']);
  });

  it('always returns a legal move when one exists', () => {
    for (let seed = 0; seed < 30; seed++) {
      const s = createGame({ width: 10, height: 10, tickMs: 150, seed });
      const d = botChoose(s);
      expect(legalMoves(s)).toContain(d);
    }
  });

  it('prefers open space over a pocket', () => {
    const s = createGame({ width: 6, height: 6, tickMs: 150, seed: 1 });
    s.body = [
      { x: 2, y: 2 },
      { x: 2, y: 3 },
      { x: 3, y: 3 },
    ];
    s.dir = 'UP';
    s.food = { x: 5, y: 5 };
    const d = botChoose(s);
    expect(legalMoves(s)).toContain(d);
    expect(freeSpaceAfter(s, d)).toBeGreaterThan(0);
  });
});
