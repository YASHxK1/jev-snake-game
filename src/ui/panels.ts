import type { JevDebug } from '../controllers/jev.ts';

export interface SessionStats {
  games: number;
  totalScore: number;
  best: number;
  totalTicks: number;
}

export type StatsMap = Record<'jev' | 'laya', SessionStats>;

export function emptyStats(): StatsMap {
  const s = (): SessionStats => ({ games: 0, totalScore: 0, best: 0, totalTicks: 0 });
  return { jev: s(), laya: s() };
}

function esc(v: unknown): string {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function renderDebug(el: HTMLElement, d: JevDebug): void {
  const probs = d.probabilities
    ? Object.entries(d.probabilities)
        .map(([k, v]) => `${k}:${(v as number).toFixed(2)}`)
        .join(' ')
    : '—';
  const modelLabel = d.model === 'laya' ? 'laya (boundless, free thru Oct 31)' : 'jev (typesafe-ai)';
  el.innerHTML =
    `<div class="dbg-row"><span>model</span><b>${modelLabel}</b></div>` +
    `<div class="dbg-row"><span>choice</span><b>${esc(d.choice ?? '—')}</b></div>` +
    `<div class="dbg-row"><span>probs</span><b>${esc(probs)}</b></div>` +
    `<div class="dbg-row"><span>confidence</span><b>${d.confidence == null ? '—' : d.confidence.toFixed(3)}</b></div>` +
    `<div class="dbg-row"><span>trapped P</span><b>${d.trapped == null ? '—' : d.trapped.toFixed(3)}</b></div>` +
    `<div class="dbg-row"><span>latency</span><b>${d.latencyMs == null ? '—' : `${d.latencyMs} ms`}</b></div>` +
    `<div class="dbg-row"><span>calls</span><b>${d.calls}</b></div>` +
    `<div class="dbg-row"><span>fallbacks</span><b>${d.fallbacks}</b></div>` +
    `<div class="dbg-row"><span>last fallback</span><b>${esc(d.lastFallbackReason)}</b></div>` +
    (d.lastError ? `<div class="dbg-row err"><span>error</span><b>${esc(d.lastError)}</b></div>` : '') +
    `<div class="dbg-row"><span>est. cost</span><b>$${d.estCostUsd.toFixed(6)}</b></div>` +
    `<details class="dbg-state"><summary>last state sent</summary><pre>${esc(d.lastStateJson)}</pre></details>`;
}

export function renderStats(el: HTMLElement, stats: StatsMap): void {
  const rows = (Object.keys(stats) as (keyof StatsMap)[])
    .map((k) => {
      const s = stats[k];
      const avg = s.games === 0 ? '—' : (s.totalScore / s.games).toFixed(1);
      const avgTicks = s.games === 0 ? '—' : Math.round(s.totalTicks / s.games).toString();
      return `<tr><td>${k}</td><td>${s.games}</td><td>${avg}</td><td>${s.best}</td><td>${avgTicks}</td></tr>`;
    })
    .join('');
  el.innerHTML =
    `<table><thead><tr><th>mode</th><th>games</th><th>avg score</th>` +
    `<th>best</th><th>avg ticks</th></tr></thead><tbody>${rows}</tbody></table>`;
}
