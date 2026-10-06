import { legalMoves } from './safety.ts';
import type { GameState } from './types.ts';

/**
 * Compact, structured encoding of the game state for Jev.
 * Pure function: stable output, short strings, well under the 32K context.
 * Sent as the `state` object of `experimental_evaluate` (string|object|array allowed).
 */
export interface EncodedState {
  /** "20x20" */
  grid: string;
  head: [number, number];
  dir: string;
  /** Full body, head-first, as [x,y] pairs. */
  body: [number, number][];
  food: [number, number];
  legal: string[];
  /** Tiny ASCII board: H=head, o=body, *=food, .=empty */
  board: string;
}

export function encodeState(state: GameState): EncodedState {
  const body = state.body.map((c): [number, number] => [c.x, c.y]);
  const head = state.body[0];
  const rows: string[] = [];
  const cellOf = new Map(state.body.map((c, i) => [`${c.x},${c.y}`, i === 0 ? 'H' : 'o']));
  for (let y = 0; y < state.height; y++) {
    let row = '';
    for (let x = 0; x < state.width; x++) {
      if (head && x === head.x && y === head.y) row += 'H';
      else if (x === state.food.x && y === state.food.y) row += '*';
      else row += cellOf.get(`${x},${y}`) ?? '.';
    }
    rows.push(row);
  }
  return {
    grid: `${state.width}x${state.height}`,
    head: head ? [head.x, head.y] : [0, 0],
    dir: state.dir,
    body,
    food: [state.food.x, state.food.y],
    legal: legalMoves(state),
    board: rows.join('\n'),
  };
}

/** Approximate input size guard: keep requests small and cheap. */
export function encodedSizeChars(enc: EncodedState): number {
  return JSON.stringify(enc).length;
}
