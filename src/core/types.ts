/** Shared Snake types. Pure data, no DOM. */

export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export interface Vec {
  x: number;
  y: number;
}

export type GamePhase = 'menu' | 'playing' | 'paused' | 'gameover' | 'win';

export type ControllerKind = 'jev' | 'laya';

export interface GameState {
  width: number;
  height: number;
  /** Head is body[0]. */
  body: Vec[];
  dir: Direction;
  food: Vec;
  score: number;
  steps: number;
  alive: boolean;
  won: boolean;
}

export interface GameConfig {
  width: number;
  height: number;
  /** ms per tick */
  tickMs: number;
  seed: number;
}

export const DIRECTIONS: readonly Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

export const DELTA: Record<Direction, Vec> = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

export function opposite(d: Direction): Direction {
  switch (d) {
    case 'UP':
      return 'DOWN';
    case 'DOWN':
      return 'UP';
    case 'LEFT':
      return 'RIGHT';
    case 'RIGHT':
      return 'LEFT';
  }
}

export function sameVec(a: Vec, b: Vec): boolean {
  return a.x === b.x && a.y === b.y;
}
