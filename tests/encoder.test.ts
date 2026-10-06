import { describe, expect, it } from 'vitest';
import { encodeState, encodedSizeChars } from '../src/core/encoder.ts';
import { createGame } from '../src/core/game.ts';

describe('state encoder', () => {
  it('is compact, structured and deterministic', () => {
    const s = createGame({ width: 20, height: 20, tickMs: 150, seed: 42 });
    const a = encodeState(s);
    const b = encodeState(s);
    expect(a).toEqual(b);
    expect(a.grid).toBe('20x20');
    expect(a.head).toEqual([10, 10]);
    expect(a.legal).toContain('RIGHT');
    expect(a.legal).not.toContain('LEFT'); // reversal excluded
    expect(encodedSizeChars(a)).toBeLessThan(4000); // far under 32K context
  });

  it('renders the ASCII board with H, *, o, .', () => {
    const s = createGame({ width: 5, height: 5, tickMs: 150, seed: 3 });
    const enc = encodeState(s);
    const rows = enc.board.split('\n');
    expect(rows).toHaveLength(5);
    expect(enc.board).toContain('H');
    expect(enc.board).toContain('*');
    // head marker matches head coords
    const [hx, hy] = enc.head;
    expect(rows[hy]?.[hx]).toBe('H');
  });
});
