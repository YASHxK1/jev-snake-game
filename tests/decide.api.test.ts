import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('ai', () => ({ experimental_evaluate: vi.fn() }));

import { experimental_evaluate } from 'ai';
import handler from '../api/decide.ts';

const mockEval = experimental_evaluate as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown): Request {
  return new Request('http://localhost/api/decide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const state = {
  grid: '20x20',
  head: [10, 10],
  dir: 'RIGHT',
  body: [
    [10, 10],
    [9, 10],
    [8, 10],
  ],
  food: [15, 10],
  legal: ['UP', 'DOWN', 'RIGHT'],
  board: '...',
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('/api/decide', () => {
  it('returns the chosen direction with probabilities + confidence', async () => {
    mockEval.mockResolvedValue({
      answers: {
        move: { type: 'choice', choice: 'RIGHT', probabilities: { UP: 0.1, DOWN: 0.15, RIGHT: 0.75 } },
        trapped: { type: 'boolean', probability: 0.2 },
      },
      usage: { inputTokens: 500, outputTokens: 0 },
      providerMetadata: { typesafe: { confidence: { move: 0.8 } } },
    });
    const res = await handler(req({ state }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json['ok']).toBe(true);
    expect(json['direction']).toBe('RIGHT');
    expect(json['confidence']).toBe(0.8);
    expect(json['trapped']).toBe(0.2);
    expect(json['estCostUsd']).toBeCloseTo(500 * (0.042 / 1_000_000));
    expect(json['fallbackUsed']).toBe(false);
  });

  it('server-filters a lethal/reversing choice to the first legal move', async () => {
    mockEval.mockResolvedValue({
      answers: {
        move: { type: 'choice', choice: 'LEFT', probabilities: { LEFT: 0.9, UP: 0.05, DOWN: 0.05 } },
      },
      usage: { inputTokens: 100 },
      providerMetadata: { typesafe: { confidence: { move: 0.9 } } },
    });
    const json = (await (await handler(req({ state }))).json()) as Record<string, unknown>;
    expect(json['fallbackUsed']).toBe(true);
    expect(json['direction']).toBe('UP'); // first legal
  });

  it('server-filters an unexpected option', async () => {
    mockEval.mockResolvedValue({
      answers: { move: { type: 'choice', choice: 'DIAGONAL', probabilities: {} } },
      usage: { inputTokens: 100 },
      providerMetadata: {},
    });
    const json = (await (await handler(req({ state }))).json()) as Record<string, unknown>;
    expect(json['fallbackUsed']).toBe(true);
  });

  it('fails soft (ok:false) after gateway errors/timeouts', async () => {
    mockEval.mockRejectedValue(new Error('fetch failed'));
    const json = (await (await handler(req({ state }))).json()) as Record<string, unknown>;
    expect(json['ok']).toBe(false);
    expect(json['error']).toBe('ai-unreachable');
    expect(mockEval).toHaveBeenCalledTimes(3); // 1 try + 2 retries
  }, 10000);

  it('rejects malformed bodies and wrong methods', async () => {
    expect((await handler(req({ nope: 1 }))).status).toBe(400);
    expect((await handler(new Request('http://localhost/api/decide'))).status).toBe(405);
  });

  it('rejects unknown model keys (allowlist)', async () => {
    expect((await handler(req({ state, model: 'gpt-99' }))).status).toBe(400);
  });

  it('routes laya to convaiinnovations/laya via boundless without ZDR by default', async () => {
    mockEval.mockResolvedValue({
      answers: {
        move: { type: 'choice', choice: 'UP', probabilities: { UP: 0.84, DOWN: 0.05, RIGHT: 0.11 } },
      },
      usage: { inputTokens: 56, outputTokens: 0 },
      providerMetadata: { typesafe: { confidence: { move: 0.56 } } },
    });
    const json = (await (await handler(req({ state, model: 'laya' }))).json()) as Record<
      string,
      unknown
    >;
    expect(json['ok']).toBe(true);
    expect(json['model']).toBe('laya');
    expect(json['direction']).toBe('UP');
    expect(json['confidence']).toBe(0.56);
    const call = mockEval.mock.calls[0]?.[0] as {
      model: string;
      providerOptions: { gateway: Record<string, unknown> };
    };
    expect(call.model).toBe('convaiinnovations/laya');
    expect(call.providerOptions.gateway).toEqual({ only: ['boundless'] });
  });

  it('falls back to inline answer confidence when metadata is absent', async () => {
    mockEval.mockResolvedValue({
      answers: {
        move: {
          type: 'choice',
          choice: 'RIGHT',
          probabilities: { UP: 0.05, DOWN: 0.05, RIGHT: 0.9 },
          confidence: 0.71,
        },
      },
      usage: { inputTokens: 60, outputTokens: 0 },
      providerMetadata: {},
    });
    const json = (await (await handler(req({ state, model: 'laya' }))).json()) as Record<
      string,
      unknown
    >;
    expect(json['confidence']).toBe(0.71);
  });
});
