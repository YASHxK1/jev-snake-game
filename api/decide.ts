/**
 * POST /api/decide — AI steering proxy (server-side only, never exposes keys).
 *
 * Receives the compact encoded game state plus a model key ('jev' | 'laya'),
 * asks the chosen evaluation model (via Vercel AI Gateway) one `choice`
 * question (UP/DOWN/LEFT/RIGHT) plus an optional speculative `boolean`
 * trap-risk question in the same round trip, then returns a small JSON
 * result the browser can gate on.
 *
 * Verified against ai@7.0.127 types:
 * - choice question: { type:'choice', instructions, criteria: Record<opt, desc> }
 * - choice answer:   { type:'choice', choice, probabilities? }
 * - boolean answer:  { type:'boolean', probability }  (NOT `noul` in the AI SDK)
 * - confidence: result.providerMetadata?.typesafe?.confidence[questionId]
 *   (choice+score only; read defensively — may be absent on other providers).
 *   Live-probed 2026-10-03: BOTH typesafe-ai/jev and convaiinnovations/laya
 *   report it under the `typesafe` namespace; Laya additionally echoes
 *   `confidence` inline on the choice answer, which we use as a fallback.
 */
import { experimental_evaluate as evaluate, type Experimental_EvaluationQuestion } from 'ai';

export type ModelKey = 'jev' | 'laya';

const MODELS: Record<ModelKey, { id: string; only: string[] }> = {
  jev: {
    id: process.env.JEV_MODEL ?? 'typesafe-ai/jev',
    only: [process.env.JEV_ONLY_PROVIDER ?? 'typesafe-ai'],
  },
  laya: {
    // Free via Boundless through Oct 31, 2026 (then the standard ID bills).
    id: process.env.LAYA_MODEL ?? 'convaiinnovations/laya',
    only: [process.env.LAYA_ONLY_PROVIDER ?? 'boundless'],
  },
};
// ZDR is Pro/Enterprise-only on AI Gateway; Hobby plans get 403. Opt-in via env.
const ZERO_DATA_RETENTION = (process.env.GATEWAY_ZDR ?? 'false').toLowerCase() === 'true';
const BODY_CAP = 16 * 1024;
/** $0.042 / 1M input tokens (Jev model page; input-only billing). Laya reports cost 0 while free. */
const USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
const DIRS: readonly string[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

// --- minimal per-IP rate limit (single-region in-memory; use Upstash for prod scale) ---
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 40;
const hits = new Map<string, { count: number; reset: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now > h.reset) {
    hits.set(ip, { count: 1, reset: now + WINDOW_MS });
    return false;
  }
  h.count += 1;
  return h.count > MAX_PER_WINDOW;
}

function isDirection(v: unknown): v is Direction {
  return typeof v === 'string' && (DIRS as string[]).includes(v);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface EncodedIn {
  grid?: string;
  head?: [number, number];
  dir?: string;
  body?: [number, number][];
  food?: [number, number];
  legal?: string[];
  board?: string;
}

function validBody(body: unknown): body is EncodedIn & { model?: unknown; useTrapCheck?: unknown } {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as { state?: unknown; model?: unknown };
  if (typeof b.state !== 'object' || b.state === null) return false;
  const s = b.state as EncodedIn;
  if (!Array.isArray(s.legal) || !Array.isArray(s.body) || typeof s.dir !== 'string') return false;
  if (!DIRS.includes(s.dir)) return false;
  // Model allowlist: strict 'jev' | 'laya' so callers can't aim the proxy at arbitrary models.
  if (b.model !== undefined && b.model !== 'jev' && b.model !== 'laya') return false;
  return true;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json({ ok: false, error: 'method-not-allowed' }, { status: 405 });
  }
  // Origin check: same-origin browser calls, or non-browser (curl/sim) callers.
  const origin = req.headers.get('origin');
  const host = req.headers.get('host') ?? req.headers.get('x-forwarded-host') ?? '';
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        return Response.json({ ok: false, error: 'bad-origin' }, { status: 403 });
      }
    } catch {
      return Response.json({ ok: false, error: 'bad-origin' }, { status: 403 });
    }
  }
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  if (rateLimited(ip)) {
    return Response.json({ ok: false, error: 'rate-limited' }, { status: 429 });
  }

  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > BODY_CAP) {
    return Response.json({ ok: false, error: 'request-too-large' }, { status: 413 });
  }
  let parsed: unknown;
  try {
    const text = await req.text();
    if (text.length > BODY_CAP) {
      return Response.json({ ok: false, error: 'request-too-large' }, { status: 413 });
    }
    parsed = JSON.parse(text) as unknown;
  } catch {
    return Response.json({ ok: false, error: 'bad-json' }, { status: 400 });
  }
  if (!validBody(parsed)) {
    return Response.json({ ok: false, error: 'bad-request' }, { status: 400 });
  }
  const { state, useTrapCheck = true, model = 'jev' } = parsed as {
    state: EncodedIn;
    useTrapCheck?: boolean;
    model?: ModelKey;
  };
  const { id: modelId, only } = MODELS[model];
  const legal = (state.legal ?? []).filter(isDirection);

  const questions: Record<string, Experimental_EvaluationQuestion> = {
    move: {
      type: 'choice',
      instructions:
        'Steer the snake one step. Move toward the food (*) while keeping enough open room to escape. ' +
        'Never pick a direction that hits a wall (H at the edge moving outward) or the body (o). ' +
        `Current direction ${state.dir}; legal moves are [${legal.join(', ')}].`,
      criteria: {
        UP: 'Move head one cell up (y-1). Good when food is above and the cell is free.',
        DOWN: 'Move head one cell down (y+1). Good when food is below and the cell is free.',
        LEFT: 'Move head one cell left (x-1). Good when food is to the left and the cell is free.',
        RIGHT: 'Move head one cell right (x+1). Good when food is to the right and the cell is free.',
      },
    },
  };
  if (useTrapCheck) {
    questions['trapped'] = {
      type: 'boolean',
      instructions: 'After this move, is the snake at risk of trapping itself with no escape route?',
      criteria: {
        true: 'The head is boxed in by walls/body or enters a pocket smaller than the snake.',
        false: 'Plenty of open connected space remains around the head.',
      },
    };
  }

  // Timeout + max 2 retries with backoff. Do NOT log full error bodies (may echo state).
  const started = Date.now();
  let lastStatus = 'gateway-error';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await evaluate({
        model: modelId,
        // JSON-round-tripped so the type is plain JSON (assignable to the SDK's state input).
        state: JSON.parse(JSON.stringify(state)) as { grid: string },
        questions,
        providerOptions: {
          gateway: { ...(ZERO_DATA_RETENTION ? { zeroDataRetention: true } : {}), only },
        },
      });
      const latencyMs = Date.now() - started;
      const move = result.answers['move'];
      const trappedAns = result.answers['trapped'];
      const confRaw = (
        result.providerMetadata as unknown as
          | { typesafe?: { confidence?: Record<string, unknown> } }
          | undefined
      )?.typesafe?.confidence;
      // Laya echoes `confidence` inline on the answer (live-probed); prefer the
      // canonical providerMetadata copy when present.
      const inlineConf =
        move && move.type === 'choice'
          ? (move as unknown as { confidence?: unknown }).confidence
          : null;
      const confidence =
        confRaw && typeof confRaw['move'] === 'number'
          ? (confRaw['move'] as number)
          : typeof inlineConf === 'number'
            ? inlineConf
            : null;
      const choice = move && move.type === 'choice' ? move.choice : null;
      const probabilities =
        move && move.type === 'choice' && move.probabilities
          ? (move.probabilities as Record<string, number>)
          : null;
      const trapped =
        trappedAns && trappedAns.type === 'boolean' ? trappedAns.probability : null;
      const inputTokens = result.usage.inputTokens ?? 0;
      const estCostUsd = inputTokens * USD_PER_INPUT_TOKEN;

      // Server-side hard filter: illegal / reversing / unexpected option never leaves the proxy.
      const fallbackUsed = !choice || !isDirection(choice) || !legal.includes(choice);
      const direction = fallbackUsed ? (legal[0] ?? state.dir ?? 'UP') : (choice as string);
      return Response.json({
        ok: true,
        model,
        direction,
        probabilities,
        confidence,
        trapped,
        latencyMs,
        usage: result.usage,
        estCostUsd,
        fallbackUsed,
        ...(fallbackUsed ? { reason: `illegal-or-unexpected:${String(choice)}` } : {}),
      });
    } catch (e) {
      // Classify without echoing bodies.
      const msg = e instanceof Error ? `${e.name}:${e.message.slice(0, 80)}` : 'unknown';
      lastStatus = msg;
      const status = (e as { statusCode?: number; status?: number })?.statusCode ??
        (e as { status?: number })?.status;
      if (status === 401 || status === 402 || status === 404) break; // not retryable
      if (attempt < 2) await sleep(150 * 2 ** attempt);
    }
  }
  console.error(`[decide] ${model} failed: ${lastStatus.slice(0, 120)}`);
  // Fail soft: client falls back to the BFS bot on ok:false.
  return Response.json(
    {
      ok: false,
      model,
      direction: legal[0] ?? 'UP',
      probabilities: null,
      confidence: null,
      trapped: null,
      latencyMs: Date.now() - started,
      usage: null,
      estCostUsd: 0,
      fallbackUsed: true,
      error: 'ai-unreachable',
    },
    { status: 200 },
  );
}
