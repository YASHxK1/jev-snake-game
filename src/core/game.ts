import { DELTA, sameVec, opposite, type Direction, type GameConfig, type GameState, type Vec } from './types.ts';
import { mulberry32, randInt, type Rng } from './rng.ts';

export interface StepResult {
  ate: boolean;
  died: boolean;
  won: boolean;
}

/** Create a fresh game: horizontal snake of length 3 centered, moving RIGHT. */
export function createGame(config: GameConfig): GameState {
  const { width, height, seed } = config;
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const body: Vec[] = [
    { x: cx, y: cy },
    { x: cx - 1, y: cy },
    { x: cx - 2, y: cy },
  ];
  const rng = mulberry32(seed);
  const food = spawnFood(width, height, body, rng);
  return { width, height, body, dir: 'RIGHT', food, score: 0, steps: 0, alive: true, won: false };
}

/** All free cells (not occupied by the snake). */
export function freeCells(width: number, height: number, body: Vec[]): Vec[] {
  const occupied = new Set(body.map((c) => `${c.x},${c.y}`));
  const out: Vec[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!occupied.has(`${x},${y}`)) out.push({ x, y });
    }
  }
  return out;
}

/** Pick a random empty cell. Assumes at least one exists. */
export function spawnFood(width: number, height: number, body: Vec[], rng: Rng): Vec {
  const free = freeCells(width, height, body);
  if (free.length === 0) return { x: -1, y: -1 };
  return free[randInt(rng, free.length)] ?? { x: 0, y: 0 };
}

/** Advance one tick. Mutates and returns the state for convenience. */
export function step(state: GameState, nextDir: Direction, rng: Rng): StepResult {
  if (!state.alive || state.won) return { ate: false, died: false, won: state.won };
  // No 180-degree turns: ignore reversals.
  if (nextDir === opposite(state.dir)) nextDir = state.dir;
  state.dir = nextDir;

  const head = state.body[0] ?? { x: 0, y: 0 };
  const d = DELTA[nextDir];
  const nh: Vec = { x: head.x + d.x, y: head.y + d.y };

  // Wall collision.
  if (nh.x < 0 || nh.y < 0 || nh.x >= state.width || nh.y >= state.height) {
    state.alive = false;
    return { ate: false, died: true, won: false };
  }

  const eating = sameVec(nh, state.food);
  // Moving into the tail cell is safe when NOT growing (tail vacates this tick).
  const tail = state.body[state.body.length - 1];
  const hitsBody = state.body.some((c, i) => {
    if (!eating && tail && i === state.body.length - 1 && sameVec(c, nh)) return false;
    return sameVec(c, nh);
  });
  if (hitsBody) {
    state.alive = false;
    return { ate: false, died: true, won: false };
  }

  state.body.unshift(nh);
  state.steps += 1;
  if (eating) {
    state.score += 1;
    if (state.body.length === state.width * state.height) {
      state.won = true;
      state.alive = false;
      return { ate: true, died: false, won: true };
    }
    state.food = spawnFood(state.width, state.height, state.body, rng);
    return { ate: true, died: false, won: false };
  }
  state.body.pop();
  return { ate: false, died: false, won: false };
}

/** Predict the state after applying `dir` for one tick (no mutation). Pure helper for Jev lookahead. */
export function predictNext(state: GameState, dir: Direction): GameState {
  const rng = mulberry32(0); // food spawn only matters if eating; position irrelevant for encoding
  const clone: GameState = {
    ...state,
    body: state.body.map((c) => ({ ...c })),
    food: { ...state.food },
  };
  step(clone, dir, rng);
  return clone;
}
