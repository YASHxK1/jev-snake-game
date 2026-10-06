import { describe, expect, it } from 'vitest';
import { createGame, freeCells, spawnFood, step } from '../src/core/game.ts';
import { mulberry32 } from '../src/core/rng.ts';

const cfg = { width: 20, height: 20, tickMs: 150, seed: 42 };

describe('movement', () => {
  it('starts centered moving RIGHT with length 3', () => {
    const s = createGame(cfg);
    expect(s.body).toHaveLength(3);
    expect(s.dir).toBe('RIGHT');
    expect(s.body[0]).toEqual({ x: 10, y: 10 });
  });

  it('advances head and drags tail', () => {
    const s = createGame(cfg);
    step(s, 'RIGHT', mulberry32(1));
    expect(s.body[0]).toEqual({ x: 11, y: 10 });
    expect(s.body).toHaveLength(3);
    expect(s.steps).toBe(1);
  });

  it('ignores 180-degree reversals', () => {
    const s = createGame(cfg);
    step(s, 'LEFT', mulberry32(1)); // reversal of RIGHT
    expect(s.body[0]).toEqual({ x: 11, y: 10 });
    expect(s.dir).toBe('RIGHT');
  });
});

describe('collision', () => {
  it('dies on wall', () => {
    const s = createGame({ ...cfg, width: 5, height: 5 });
    s.body = [
      { x: 4, y: 2 },
      { x: 3, y: 2 },
      { x: 2, y: 2 },
    ];
    s.dir = 'RIGHT';
    const r = step(s, 'RIGHT', mulberry32(1));
    expect(r.died).toBe(true);
    expect(s.alive).toBe(false);
  });

  it('dies on self collision', () => {
    const s = createGame(cfg);
    // Head at (5,5) moving DOWN into body segment (5,6).
    s.body = [
      { x: 5, y: 5 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
      { x: 6, y: 5 },
    ];
    s.dir = 'DOWN';
    const r = step(s, 'DOWN', mulberry32(1));
    expect(r.died).toBe(true);
  });

  it('may chase its own tail (tail vacates)', () => {
    const s = createGame(cfg);
    s.body = [
      { x: 5, y: 5 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
      { x: 6, y: 5 },
    ];
    s.dir = 'UP';
    s.food = { x: 0, y: 0 };
    const r = step(s, 'RIGHT', mulberry32(1)); // head -> (6,5) which is the tail
    expect(r.died).toBe(false);
    expect(s.body[0]).toEqual({ x: 6, y: 5 });
  });
});

describe('growth + food', () => {
  it('grows and scores when eating', () => {
    const s = createGame(cfg);
    s.food = { x: 11, y: 10 }; // directly ahead
    const r = step(s, 'RIGHT', mulberry32(7));
    expect(r.ate).toBe(true);
    expect(s.body).toHaveLength(4);
    expect(s.score).toBe(1);
  });

  it('spawns food on an empty cell only', () => {
    const s = createGame({ ...cfg, width: 4, height: 4 });
    s.body = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ];
    for (let i = 0; i < 20; i++) {
      const f = spawnFood(4, 4, s.body, mulberry32(i));
      expect(s.body.some((c) => c.x === f.x && c.y === f.y)).toBe(false);
    }
  });

  it('freeCells shrinks as the snake grows', () => {
    expect(freeCells(4, 4, [{ x: 0, y: 0 }])).toHaveLength(15);
  });

  it('wins when the board fills', () => {
    const s = createGame({ ...cfg, width: 3, height: 2 });
    // 5 of 6 cells filled, head next to last free cell (2,1) which holds food.
    s.body = [
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    s.dir = 'RIGHT';
    s.food = { x: 2, y: 1 };
    const r = step(s, 'RIGHT', mulberry32(1));
    expect(r.won).toBe(true);
    expect(s.won).toBe(true);
  });
});
