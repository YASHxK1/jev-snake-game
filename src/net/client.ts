import type { EncodedState } from '../core/encoder.ts';

export type AiModel = 'jev' | 'laya';

export interface DecideRequest {
  state: EncodedState;
  model: AiModel;
  useTrapCheck?: boolean;
}

export interface DecideResponse {
  ok: boolean;
  model?: AiModel;
  direction: string;
  probabilities: Record<string, number> | null;
  confidence: number | null;
  trapped: number | null;
  latencyMs: number;
  usage: { inputTokens?: number; outputTokens?: number } | null;
  estCostUsd: number;
  error?: string;
  fallbackUsed?: boolean;
}

const SIZE_CAP = 16 * 1024;

/** POST /api/decide with timeout. Returns null on timeout/offline (caller falls back). */
export async function postDecide(body: DecideRequest, timeoutMs: number): Promise<DecideResponse | null> {
  const json = JSON.stringify(body);
  if (json.length > SIZE_CAP) throw new Error('request-too-large');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch('/api/decide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      // Do not log full bodies (may contain submitted state). Surface status only.
      const data = (await res.json().catch(() => null)) as Partial<DecideResponse> | null;
      return {
        ok: false,
        direction: '',
        probabilities: data?.probabilities ?? null,
        confidence: data?.confidence ?? null,
        trapped: data?.trapped ?? null,
        latencyMs: 0,
        usage: data?.usage ?? null,
        estCostUsd: 0,
        error: `http-${res.status}`,
      };
    }
    return (await res.json()) as DecideResponse;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    if (e instanceof TypeError) return null; // offline / unreachable
    throw e;
  } finally {
    clearTimeout(t);
  }
}
