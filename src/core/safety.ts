import { DELTA, opposite, sameVec, type Direction, type GameState } from './types.ts';

/** Moves that do not instantly kill (wall, body) and are not 180-degree reversals. */
export function legalMoves(state: GameState): Direction[] {
  const out: Direction[] = [];
  const head = state.body[0];
  if (!head) return out;
  const tail = state.body[state.body.length - 1];
  const occupied = new Set(state.body.map((c) => `${c.x},${c.y}`));
  const tailKey = tail ? `${tail.x},${tail.y}` : '';
  for (const d of ['UP', 'DOWN', 'LEFT', 'RIGHT'] as const) {
    if (d === opposite(state.dir)) continue;
    const nx = head.x + DELTA[d].x;
    const ny = head.y + DELTA[d].y;
    if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
    const eating = nx === state.food.x && ny === state.food.y;
    const key = `${nx},${ny}`;
    if (occupied.has(key) && (eating || key !== tailKey)) continue;
    out.push(d);
  }
  return out;
}

/** True if `dir` is immediately lethal or a reversal (used for hard filtering of AI output). */
export function isLethalOrReversal(state: GameState, dir: Direction): boolean {
  if (dir === opposite(state.dir)) return true;
  return !legalMoves(state).includes(dir);
}

/** Manhattan distance from a cell to food. */
export function foodDistance(state: GameState, from = state.body[0] ?? { x: 0, y: 0 }): number {
  return Math.abs(from.x - state.food.x) + Math.abs(from.y - state.food.y);
}

/** True when the head is adjacent to its own body or a wall (1-ply danger hint). */
export function headCrowded(state: GameState): boolean {
  return legalMoves(state).length <= 1;
}

export { sameVec };
