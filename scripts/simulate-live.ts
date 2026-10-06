/**
 * OPTIONAL live comparison: real Jev (via AI Gateway) vs the BFS bot.
 * Requires a gateway credential: AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN.
 * Run: `npx tsx scripts/simulate-live.ts [games]`
 * Skipped automatically without credentials. Kept separate so CI never pays.
 */
import { experimental_evaluate as evaluate, type Experimental_EvaluationQuestion } from 'ai';
import { createGame, step } from '../src/core/game.ts';
import { mulberry32 } from '../src/core/rng.ts';
import { botChoose } from '../src/controllers/bot.ts';
import { encodeState } from '../src/core/encoder.ts';
import { isLethalOrReversal } from '../src/core/safety.ts';
import type { Direction, GameState } from '../src/core/types.ts';

const MODEL = process.env.JEV_MODEL ?? 'typesafe-ai/jev';
const ONLY = process.env.JEV_ONLY_PROVIDER ?? 'typesafe-ai';

function hasCreds(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_OIDC_TOKEN);
}

async function jevMove(s: GameState): Promise<Direction> {
  try {
    const questions: Record<string, Experimental_EvaluationQuestion> = {
      move: {
        type: 'choice',
        instructions: 'Steer the snake toward food while keeping escape room.',
        criteria: {
          UP: 'Move head one cell up.',
          DOWN: 'Move head one cell down.',
          LEFT: 'Move head one cell left.',
          RIGHT: 'Move head one cell right.',
        },
      },
    };
    const result = await evaluate({
      model: MODEL,
      state: JSON.parse(JSON.stringify(encodeState(s))) as { grid: string },
      questions,
      providerOptions: { gateway: { zeroDataRetention: true, only: [ONLY] } },
    });
    const ans = result.answers['move'];
    const c = ans && ans.type === 'choice' ? (ans.choice as Direction) : null;
    if (c && !isLethalOrReversal(s, c)) return c;
  } catch (e) {
    console.error('live jev call failed:', e instanceof Error ? e.message.slice(0, 100) : e);
  }
  return botChoose(s);
}

async function main(): Promise<void> {
  if (!hasCreds()) {
    console.log('No AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN — skipping live sim.');
    return;
  }
  const games = Number(process.argv[2] ?? 3);
  for (let g = 0; g < games; g++) {
    for (const [name, pick] of [
      ['bot', async (s: GameState) => botChoose(s)],
      ['jev', jevMove],
    ] as const) {
      const rng = mulberry32(1000 + g);
      const s = createGame({ width: 10, height: 10, tickMs: 150, seed: 1000 + g });
      for (let t = 0; t < 300 && s.alive && !s.won; t++) {
        step(s, await pick(s), rng);
      }
      console.log(`game ${g + 1} ${name}: score=${s.score} ticks=${s.steps}`);
    }
  }
}

void main();
