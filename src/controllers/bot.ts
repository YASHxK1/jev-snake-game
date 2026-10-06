import { DELTA, opposite, type Direction, type GameState, type Vec } from '../core/types.ts';
import { legalMoves } from '../core/safety.ts';

function key(v: Vec): string {
  return `${v.x},${v.y}`;
}

/** BFS shortest path (as direction list) from head to food, avoiding body. Tail is passable (it moves). */
export function bfsPath(state: GameState): Direction[] | null {
  const head = state.body[0];
  if (!head) return null;
  const blocked = new Set(state.body.map(key));
  const tail = state.body[state.body.length - 1];
  if (tail) blocked.delete(key(tail)); // tail vacates unless growing
  const target = key(state.food);
  const queue: Vec[] = [{ ...head }];
  const prev = new Map<string, { from: string; dir: Direction }>();
  const seen = new Set([key(head)]);
  while (queue.length > 0) {
    const cur = queue.shift() as Vec;
    if (key(cur) === target) {
      const path: Direction[] = [];
      let k = target;
      while (k !== key(head)) {
        const p = prev.get(k);
        if (!p) break;
        path.unshift(p.dir);
        k = p.from;
      }
      return path;
    }
    for (const d of ['UP', 'DOWN', 'LEFT', 'RIGHT'] as const) {
      if (cur.x === head.x && cur.y === head.y && d === opposite(state.dir)) continue;
      const n = { x: cur.x + DELTA[d].x, y: cur.y + DELTA[d].y };
      if (n.x < 0 || n.y < 0 || n.x >= state.width || n.y >= state.height) continue;
      const k = key(n);
      const isFood = k === target;
      if (blocked.has(k) && !isFood) continue;
      if (seen.has(k)) continue;
      seen.add(k);
      prev.set(k, { from: key(cur), dir: d });
      queue.push(n);
    }
  }
  return null;
}

/** Flood-fill free-space count after hypothetically moving head to `cell`. */
export function freeSpaceAfter(state: GameState, dir: Direction): number {
  const head = state.body[0];
  if (!head) return 0;
  const nh = { x: head.x + DELTA[dir].x, y: head.y + DELTA[dir].y };
  if (nh.x < 0 || nh.y < 0 || nh.x >= state.width || nh.y >= state.height) return -1;
  const eating = nh.x === state.food.x && nh.y === state.food.y;
  const body = eating ? state.body : state.body.slice(0, -1);
  const blocked = new Set(body.map(key));
  if (blocked.has(key(nh))) return -1;
  // Flood fill from new head.
  let count = 0;
  const seen = new Set([key(nh)]);
  const stack: Vec[] = [nh];
  while (stack.length > 0) {
    const c = stack.pop() as Vec;
    count++;
    for (const d of Object.values(DELTA)) {
      const n = { x: c.x + d.x, y: c.y + d.y };
      if (n.x < 0 || n.y < 0 || n.x >= state.width || n.y >= state.height) continue;
      const k = key(n);
      if (seen.has(k) || blocked.has(k)) continue;
      seen.add(k);
      stack.push(n);
    }
  }
  return count;
}

/** Pure fallback functions for Jev (BFS bot logic). No controller class — game is AI-driven only. */
export function botChoose(state: GameState): Direction {
  const legal = legalMoves(state);
  if (legal.length === 0) return state.dir; // doomed; caller will detect collision
  const path = bfsPath(state);
  if (path && path.length > 0) {
    const first = path[0] as Direction;
    if (legal.includes(first)) {
      // Prefer the BFS step, but avoid stepping into a pocket smaller than the snake.
      if ((freeSpaceAfter(state, first) as number) >= state.body.length) return first;
    }
  }
  // Safest legal move = most free space after moving (greedy survival).
  let best = legal[0] as Direction;
  let bestSpace = -1;
  for (const d of legal) {
    const s = freeSpaceAfter(state, d);
    if (s > bestSpace) {
      bestSpace = s;
      best = d;
    }
  }
  return best;
}
