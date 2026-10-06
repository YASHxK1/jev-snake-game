/**
 * Headless simulation: BFS bot vs stubbed Jev (no network).
 * Run: `npx tsx scripts/simulate.ts [games] [size]`
 * The stub mimics a noisy Jev: mostly the bot's safe move, sometimes random-legal.
 */
import { createGame, step } from '../src/core/game.ts';
import { mulberry32 } from '../src/core/rng.ts';
import { botChoose } from '../src/controllers/bot.ts';
import { legalMoves } from '../src/core/safety.ts';
import type { Direction } from '../src/core/types.ts';

export interface SimReport {
  bot: { games: number; avgScore: number; avgTicks: number; best: number };
  stubJev: { games: number; avgScore: number; avgTicks: number; best: number };
}

function playOne(pick: (s: Parameters<typeof botChoose>[0]) => Direction, seed: number, size: number, maxTicks: number): { score: number; ticks: number } {
  const rng = mulberry32(seed);
  const s = createGame({ width: size, height: size, tickMs: 150, seed });
  for (let t = 0; t < maxTicks && s.alive && !s.won; t++) {
    step(s, pick(s), rng);
  }
  return { score: s.score, ticks: s.steps };
}

function summarize(runs: { score: number; ticks: number }[]): { games: number; avgScore: number; avgTicks: number; best: number } {
  const games = runs.length;
  const totalScore = runs.reduce((a, r) => a + r.score, 0);
  const totalTicks = runs.reduce((a, r) => a + r.ticks, 0);
  return {
    games,
    avgScore: games ? totalScore / games : 0,
    avgTicks: games ? totalTicks / games : 0,
    best: runs.reduce((a, r) => Math.max(a, r.score), 0),
  };
}

export function runHeadless(opts: { games: number; size: number; maxTicks: number; seed: number }): SimReport {
  const { games, size, maxTicks, seed } = opts;
  const botRuns: { score: number; ticks: number }[] = [];
  const jevRuns: { score: number; ticks: number }[] = [];
  const jrng = mulberry32(seed ^ 0x9e3779b9);
  for (let g = 0; g < games; g++) {
    botRuns.push(playOne((s) => botChoose(s), seed + g * 7919, size, maxTicks));
    // Stubbed Jev: 80% safe move, 20% random legal (models fuzzy-but-noisy decisions).
    jevRuns.push(
      playOne((s) => {
        const legal = legalMoves(s);
        if (legal.length === 0) return s.dir;
        if (jrng() < 0.8) return botChoose(s);
        return legal[Math.floor(jrng() * legal.length)] ?? legal[0] ?? s.dir;
      }, seed + g * 104729 + 1, size, maxTicks),
    );
  }
  return { bot: summarize(botRuns), stubJev: summarize(jevRuns) };
}

// CLI entry: tsx sets argv[1] to the script path; require.main check via import.meta is ESM-safe.
const isMain = process.argv[1]?.endsWith('scripts/simulate.ts') || process.argv[1]?.endsWith('simulate.ts');
if (isMain) {
  const games = Number(process.argv[2] ?? 50);
  const size = Number(process.argv[3] ?? 12);
  const report = runHeadless({ games, size, maxTicks: 2000, seed: 20261003 });
  console.log(`Headless sim: ${games} games on ${size}x${size}`);
  console.table({
    'bfs-bot': { avgScore: report.bot.avgScore.toFixed(2), avgTicks: Math.round(report.bot.avgTicks), best: report.bot.best },
    'stub-jev(80/20)': { avgScore: report.stubJev.avgScore.toFixed(2), avgTicks: Math.round(report.stubJev.avgTicks), best: report.stubJev.best },
  });
}
