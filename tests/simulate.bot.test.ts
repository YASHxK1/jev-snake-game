import { describe, expect, it } from 'vitest';
import { runHeadless } from '../scripts/simulate.ts';

describe('headless simulation (bot vs stubbed Jev)', () => {
  it('completes games and reports averages', () => {
    const report = runHeadless({ games: 10, size: 10, maxTicks: 500, seed: 123 });
    console.log(JSON.stringify(report, null, 2));
    expect(report.bot.games).toBe(10);
    expect(report.stubJev.games).toBe(10);
    expect(report.bot.avgScore).toBeGreaterThan(0);
    expect(report.stubJev.avgScore).toBeGreaterThan(0);
  });
});
