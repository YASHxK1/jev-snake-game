import type { GameState } from '../core/types.ts';

/** Canvas 2D board renderer. No game logic; draws grid, snake, food, overlays. */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private cell = 20;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
  }

  resize(cssSize: number, cells: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.style.width = `${cssSize}px`;
    this.canvas.style.height = `${cssSize}px`;
    this.canvas.width = Math.round(cssSize * dpr);
    this.canvas.height = Math.round(cssSize * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cell = cssSize / cells;
  }

  draw(state: GameState): void {
    const { ctx, cell } = this;
    const W = state.width * cell;
    const H = state.height * cell;
    ctx.clearRect(0, 0, W, H);
    // Board
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, W, H);
    // Checkerboard
    ctx.fillStyle = '#0e1530';
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        if ((x + y) % 2 === 0) ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    // Food (pulsing red dot)
    const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 200);
    ctx.fillStyle = `rgba(255,70,90,${pulse.toFixed(3)})`;
    const fx = state.food.x * cell;
    const fy = state.food.y * cell;
    const r = (cell * 0.36) / 1;
    ctx.beginPath();
    ctx.arc(fx + cell / 2, fy + cell / 2, Math.max(2, r), 0, Math.PI * 2);
    ctx.fill();
    // Snake
    state.body.forEach((c, i) => {
      const t = state.body.length <= 1 ? 0 : i / (state.body.length - 1);
      const g = Math.round(220 - 120 * t);
      ctx.fillStyle = i === 0 ? '#4ade80' : `rgb(34,${g},110)`;
      const pad = i === 0 ? cell * 0.06 : cell * 0.12;
      const x = c.x * cell + pad;
      const y = c.y * cell + pad;
      const s = cell - pad * 2;
      const rad = Math.min(6, s * 0.3);
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, s, s, rad);
      else ctx.rect(x, y, s, s);
      ctx.fill();
      if (i === 0) {
        // Eyes oriented by direction
        ctx.fillStyle = '#06130b';
        const ex = cell * 0.22;
        const ey = cell * 0.28;
        const cx = c.x * cell + cell / 2;
        const cy = c.y * cell + cell / 2;
        const off =
          state.dir === 'UP'
            ? [0, -ey]
            : state.dir === 'DOWN'
              ? [0, ey]
              : state.dir === 'LEFT'
                ? [-ey, 0]
                : [ey, 0];
        for (const s of [-1, 1]) {
          const px = state.dir === 'UP' || state.dir === 'DOWN' ? cx + s * ex : cx + off[0];
          const py = state.dir === 'LEFT' || state.dir === 'RIGHT' ? cy + s * ex : cy + off[1];
          ctx.beginPath();
          ctx.arc(px, py, Math.max(1.5, cell * 0.07), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
    // Grid border
    ctx.strokeStyle = '#223055';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  }
}
